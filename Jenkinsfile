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
          sh 'npm test -- --coverage'
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

     stage('Deploy to K3s') {
            steps {
                script {
                    // Écrire le fichier kubeconfig
                    writeFile file: 'kubeconfig.yaml', text: "${K3S_CONFIG}"
                    
                    // Créer le manifeste de déploiement
                    def deploymentYaml = """
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bibliotheque-api-gateway
  namespace: bibliotheque
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bibliotheque-api-gateway
  template:
    metadata:
      labels:
        app: bibliotheque-api-gateway
    spec:
      containers:
      - name: api-gateway
        image: ${DOCKER_REGISTRY}/bibliotheque-api-gateway:${env.BUILD_NUMBER}
        ports:
        - containerPort: 3001
        env:
        - name: PORT
          value: "3001"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: bibliotheque-secrets
              key: jwt-secret
        - name: AUTH_SERVICE_URL
          value: "http://bibliotheque-auth-service:3002"
        - name: BOOKS_SERVICE_URL
          value: "http://bibliotheque-books-service:3003"
        resources:
          limits:
            cpu: "0.3"
            memory: "256Mi"
          requests:
            cpu: "0.1"
            memory: "128Mi"
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3001
          initialDelaySeconds: 10
          periodSeconds: 5
"""
                    
                    // Créer le manifeste de service
                    def serviceYaml = """
apiVersion: v1
kind: Service
metadata:
  name: bibliotheque-api-gateway-service
  namespace: bibliotheque
spec:
  type: NodePort
  ports:
  - port: 3001
    targetPort: 3001
    nodePort: 30081
  selector:
    app: bibliotheque-api-gateway
"""
                    
                    // Écrire les fichiers YAML
                    writeFile file: 'deployment.yaml', text: deploymentYaml
                    writeFile file: 'service.yaml', text: serviceYaml
                    
                    // Appliquer les manifestes
                    sh "KUBECONFIG=kubeconfig.yaml kubectl apply -f deployment.yaml"
                    sh "KUBECONFIG=kubeconfig.yaml kubectl apply -f service.yaml"
                    
                    // Vérifier le déploiement
                    sh "KUBECONFIG=kubeconfig.yaml kubectl rollout status deployment/bibliotheque-api-gateway -n bibliotheque --timeout=180s"
                }
            }
            post {
                failure {
                    sh "KUBECONFIG=kubeconfig.yaml kubectl rollout undo deployment/bibliotheque-api-gateway -n bibliotheque"
                    echo "Deployment failed, rolling back to previous version"
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
        always {
            // Nettoyer les fichiers temporaires
            sh "rm -f kubeconfig.yaml deployment.yaml service.yaml prometheus-config.yaml grafana-dashboard.yaml"
        }
        success {
            echo "Pipeline completed successfully!"
        }
        failure {
            echo "Pipeline failed!"
        }
    }
}