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
              kubectl apply -f k8s/deployment.yaml -n $KUBE_NAMESPACE
              kubectl apply -f k8s/service.yaml -n $KUBE_NAMESPACE
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
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
              
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
              
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
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
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              # Create monitoring namespace if not exists
              kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
            '''
            
            // Prometheus ConfigMap
            def prometheusConfig = """
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
            
            // Grafana Dashboard ConfigMap
            def grafanaDashboard = """
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
            
            writeFile file: 'prometheus-config.yaml', text: prometheusConfig
            writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard
            
            sh '''
              # Apply monitoring configuration
              kubectl apply -f prometheus-config.yaml --validate=false
              kubectl apply -f grafana-dashboard.yaml
              
              # Restart Prometheus to load new config
              kubectl rollout restart deployment prometheus -n monitoring || echo "Prometheus deployment not found"
              
              # Wait for Grafana to be ready
              kubectl wait --for=condition=available deployment/grafana -n monitoring --timeout=120s || echo "Grafana not found"
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            mkdir -p ~/.kube
            cp "$KUBECONFIG_FILE" ~/.kube/config
            chmod 600 ~/.kube/config

            echo "Rolling back API Gateway deployment..."
            kubectl rollout undo deployment/bibliotheque-api-gateway -n $KUBE_NAMESPACE || true
            sleep 15
            kubectl rollout status deployment/bibliotheque-api-gateway -n $KUBE_NAMESPACE --timeout=120s || true
            echo "Rollback completed"
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