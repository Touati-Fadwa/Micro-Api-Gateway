pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-api-gateway"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('Micro-Api-Gateway') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('Micro-Api-Gateway') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm run test:ci'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Create Kubernetes Secrets') {
      steps {
        script {
          withCredentials([
            file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
            string(credentialsId: 'JWT_SECRET_CREDENTIALS', variable: 'JWT_SECRET'),
            usernamePassword(
              credentialsId: 'DB_CREDENTIALS',
              usernameVariable: 'DB_USER',
              passwordVariable: 'DB_PASSWORD'
            )
          ]) {
            sh '''
              # Configure kubectl access
              mkdir -p ~/.kube
              cp "$KUBECONFIG_FILE" ~/.kube/config
              chmod 600 ~/.kube/config

              # Replace placeholders in secrets file
              sed -i "s/{{JWT_SECRET}}/$JWT_SECRET/g" k8s/secrets.yaml
              sed -i "s/{{DB_USER}}/$DB_USER/g" k8s/secrets.yaml
              sed -i "s/{{DB_PASSWORD}}/$DB_PASSWORD/g" k8s/secrets.yaml
              
              # Apply secrets
              kubectl apply -f k8s/secrets.yaml -n $KUBE_NAMESPACE
            '''
          }
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              # Configure kubectl access
              mkdir -p ~/.kube
              cp "$KUBECONFIG_FILE" ~/.kube/config
              chmod 600 ~/.kube/config

              # Test connection
              kubectl get nodes
              kubectl cluster-info
              
              # Create namespace if not exists
              kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              # Commande simplifiée avec le namespace directement spécifié
              kubectl apply -f k8s/deployment.yaml -n bibliotheque
              kubectl apply -f k8s/service.yaml -n bibliotheque
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              # Display deployment information
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
              
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
              
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
              # Generate access URL
              echo "Application accessible via:"
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-api-gateway-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }

    stage('Configure Monitoring') {
      steps {
        script {
          // Créer ConfigMap pour Prometheus
          def prometheusConfigYaml = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-api-gateway-config
  namespace: monitoring
data:
  prometheus-api-gateway.yml: |
    - job_name: 'api-gateway'
      scrape_interval: 15s
      static_configs:
        - targets: ['bibliotheque-api-gateway-service.bibliotheque.svc.cluster.local:3001']
      metrics_path: /metrics
"""
                    
          // Créer ConfigMap pour Grafana
          def grafanaDashboardYaml = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-api-gateway-dashboard
  namespace: monitoring
data:
  api-gateway-dashboard.json: |
    {
      "annotations": {
        "list": []
      },
      "editable": true,
      "gnetId": null,
      "graphTooltip": 0,
      "id": null,
      "links": [],
      "panels": [
        {
          "aliasColors": {},
          "bars": false,
          "dashLength": 10,
          "dashes": false,
          "datasource": "Prometheus",
          "fieldConfig": {
            "defaults": {
              "custom": {}
            },
            "overrides": []
          },
          "fill": 1,
          "fillGradient": 0,
          "gridPos": {
            "h": 8,
            "w": 12,
            "x": 0,
            "y": 0
          },
          "hiddenSeries": false,
          "id": 1,
          "legend": {
            "avg": false,
            "current": false,
            "max": false,
            "min": false,
            "show": true,
            "total": false,
            "values": false
          },
          "lines": true,
          "linewidth": 1,
          "nullPointMode": "null",
          "options": {
            "alertThreshold": true
          },
          "percentage": false,
          "pluginVersion": "7.2.0",
          "pointradius": 2,
          "points": false,
          "renderer": "flot",
          "seriesOverrides": [],
          "spaceLength": 10,
          "stack": false,
          "steppedLine": false,
          "targets": [
            {
              "expr": "rate(http_requests_total{job=\\"api-gateway\\"}[5m])",
              "interval": "",
              "legendFormat": "",
              "refId": "A"
            }
          ],
          "thresholds": [],
          "timeFrom": null,
          "timeRegions": [],
          "timeShift": null,
          "title": "Request Rate",
          "tooltip": {
            "shared": true,
            "sort": 0,
            "value_type": "individual"
          },
          "type": "graph",
          "xaxis": {
            "buckets": null,
            "mode": "time",
            "name": null,
            "show": true,
            "values": []
          },
          "yaxes": [
            {
              "format": "short",
              "label": null,
              "logBase": 1,
              "max": null,
              "min": null,
              "show": true
            },
            {
              "format": "short",
              "label": null,
              "logBase": 1,
              "max": null,
              "min": null,
              "show": true
            }
          ],
          "yaxis": {
            "align": false,
            "alignLevel": null
          }
        }
      ],
      "schemaVersion": 26,
      "style": "dark",
      "tags": [],
      "templating": {
        "list": []
      },
      "time": {
        "from": "now-6h",
        "to": "now"
      },
      "timepicker": {},
      "timezone": "",
      "title": "API Gateway Dashboard",
      "uid": "api-gateway",
      "version": 1
    }
"""
                    
          // Écrire les fichiers YAML
          writeFile file: 'prometheus-config.yaml', text: prometheusConfigYaml
          writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboardYaml
                    
          // Appliquer les ConfigMaps
          sh "KUBECONFIG=kubeconfig.yaml kubectl apply -f prometheus-config.yaml"
          sh "KUBECONFIG=kubeconfig.yaml kubectl apply -f grafana-dashboard.yaml"
                    
          // Redémarrer Prometheus pour appliquer les changements
          sh "KUBECONFIG=kubeconfig.yaml kubectl rollout restart deployment prometheus -n monitoring"
                    
          // Importer le dashboard dans Grafana
          sh """
          KUBECONFIG=kubeconfig.yaml kubectl exec -n monitoring deploy/grafana -- curl -X POST \
          -H "Content-Type: application/json" \
          -d @/etc/grafana/provisioning/dashboards/api-gateway-dashboard.json \
          http://admin:admin@localhost:3000/api/dashboards/db
          """
        }
      }
    }
        
    stage('K9s Guide') {
      steps {
        echo """
## Guide pour travailler avec K9s sur K3s

1. Installer K9s: https://k9scli.io/
2. Configurer K9s pour utiliser votre kubeconfig K3s:
   export KUBECONFIG=/chemin/vers/votre/k3s.yaml
3. Lancer K9s: k9s

Commandes utiles dans K9s:
- :deploy pour voir les déploiements
- :svc pour voir les services
- :pod pour voir les pods
- Ctrl+d pour supprimer une ressource
- Ctrl+k pour tuer un pod
- d pour décrire une ressource
- l pour voir les logs

Pour accéder à l'API Gateway: http://IP_DU_NOEUD:30081
Pour accéder à Grafana: http://IP_DU_NOEUD:30300 (si configuré sur ce port)
Pour accéder à Prometheus: http://IP_DU_NOEUD:30900 (si configuré sur ce port)
"""
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            # Configure kubectl access
            mkdir -p ~/.kube
            cp "$KUBECONFIG_FILE" ~/.kube/config
            chmod 600 ~/.kube/config

            echo "!!! Deployment failed - Initiating rollback !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s || true
            echo "Rollback to previous version completed"
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}