pipeline {
    agent any

    environment {
        IMAGE_NAME = "touatifadwa/bibliotheque-api-gateway"
        IMAGE_TAG = "latest"
        REGISTRY = "docker.io"
        KUBE_NAMESPACE = "bibliotheque"
        HELM_RELEASE_NAME = "monitoring-stack"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
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

        stage('Run Tests') {
            steps {
                dir('microservice-auth') {
                    sh 'npm run test:ci'
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
                }
            }
        }

        stage('Push Docker Image') {
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

        stage('Configure Kubernetes') {
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
                            # Set up kubectl access
                            mkdir -p ~/.kube
                            cp "$KUBECONFIG_FILE" ~/.kube/config
                            chmod 600 ~/.kube/config

                            # Create namespace if not exists
                            kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

                            # Apply secrets
                            sed -i "s/{{JWT_SECRET}}/$JWT_SECRET/g" k8s/secrets.yaml
                            sed -i "s/{{DB_USER}}/$DB_USER/g" k8s/secrets.yaml
                            sed -i "s/{{DB_PASSWORD}}/$DB_PASSWORD/g" k8s/secrets.yaml
                            kubectl apply -f k8s/secrets.yaml -n $KUBE_NAMESPACE
                        '''
                    }
                }
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            # Deploy API Gateway
                            kubectl apply -f k8s/deployment.yaml -n $KUBE_NAMESPACE
                            kubectl apply -f k8s/service.yaml -n $KUBE_NAMESPACE
                            
                            # Wait for deployment to be ready
                            kubectl rollout status deployment/bibliotheque-api-gateway -n $KUBE_NAMESPACE --timeout=300s
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
                            kubectl get deploy -n $KUBE_NAMESPACE -o wide
                            
                            echo "\n=== Service Details ==="
                            kubectl get svc -n $KUBE_NAMESPACE -o wide
                            
                            echo "\n=== Pods Status ==="
                            kubectl get pods -n $KUBE_NAMESPACE -o wide
                            
                            echo "\n=== Application Access ==="
                            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            NODE_PORT=$(kubectl get svc bibliotheque-api-gateway-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
                            echo "API Gateway URL: http://$NODE_IP:$NODE_PORT"
                            
                            # Basic health check
                            echo "\n=== Health Check ==="
                            curl -sSf "http://$NODE_IP:$NODE_PORT/api/health" || echo "Health check failed"
                        '''
                    }
                }
            }
        }

        stage('Setup Monitoring') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        try {
                            sh '''
                                # Create monitoring namespace
                                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
                                
                                # Install Helm if not available
                                if ! command -v helm &> /dev/null; then
                                    echo "Installing Helm..."
                                    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
                                    chmod 700 get_helm.sh
                                    ./get_helm.sh
                                fi
                                
                                # Add Prometheus Helm repo
                                helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                                helm repo update
                                
                                echo "Installing Prometheus Stack..."
                                helm upgrade --install $HELM_RELEASE_NAME prometheus-community/kube-prometheus-stack \
                                    --namespace monitoring \
                                    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
                                    --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
                                    --wait --timeout 5m
                                
                                # Wait for monitoring components to be ready
                                kubectl wait --for=condition=available deployment/$HELM_RELEASE_NAME-grafana -n monitoring --timeout=300s
                                kubectl wait --for=condition=available statefulset/$HELM_RELEASE_NAME-prometheus -n monitoring --timeout=300s || true
                            '''
                            
                            // Apply Prometheus and Grafana configuration
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
                                kubectl apply -f prometheus-config.yaml
                                kubectl apply -f grafana-dashboard.yaml
                                
                                # Restart Prometheus to reload config
                                kubectl rollout restart statefulset/$HELM_RELEASE_NAME-prometheus -n monitoring || true
                                
                                # Get monitoring service ports
                                GRAFANA_PORT=$(kubectl get svc ${HELM_RELEASE_NAME}-grafana -n monitoring -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30300")
                                PROMETHEUS_PORT=$(kubectl get svc ${HELM_RELEASE_NAME}-kube-p-prometheus -n monitoring -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30900")
                                
                                echo "\n=== Monitoring Access ==="
                                echo "Grafana URL: http://$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):$GRAFANA_PORT"
                                echo "Prometheus URL: http://$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):$PROMETHEUS_PORT"
                                echo "Grafana credentials: admin/prom-operator"
                            '''
                        } catch (Exception e) {
                            echo "Monitoring setup failed: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('K9s Guide') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            # Get node IP and ports for services
                            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            API_GATEWAY_PORT=$(kubectl get svc bibliotheque-api-gateway-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
                            GRAFANA_PORT=$(kubectl get svc ${HELM_RELEASE_NAME}-grafana -n monitoring -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30300")
                            PROMETHEUS_PORT=$(kubectl get svc ${HELM_RELEASE_NAME}-kube-p-prometheus -n monitoring -o jsonpath='{.spec.ports[0].nodePort}' 2>/dev/null || echo "30900")
                        '''
                        
                        echo """
## Guide pour travailler avec K9s sur K3s

1. Installer K9s: https://k9scli.io/
2. Configurer K9s pour utiliser votre kubeconfig K3s:
   export KUBECONFIG=~/.kube/config
3. Lancer K9s: 
   k9s --namespace ${KUBE_NAMESPACE}

Commandes utiles dans K9s:
- :deploy    - Voir les déploiements
- :svc       - Voir les services
- :pod       - Voir les pods
- Ctrl+d     - Supprimer une ressource
- Ctrl+k     - Tuer un pod
- d          - Décrire une ressource
- l          - Voir les logs
- :ns        - Changer de namespace

Accès aux services:
- API Gateway:  http://${sh(returnStdout: true, script: 'echo $NODE_IP').trim()}:${sh(returnStdout: true, script: 'echo $API_GATEWAY_PORT').trim()}
- Grafana:      http://${sh(returnStdout: true, script: 'echo $NODE_IP').trim()}:${sh(returnStdout: true, script: 'echo $GRAFANA_PORT').trim()} (admin/prom-operator)
- Prometheus:   http://${sh(returnStdout: true, script: 'echo $NODE_IP').trim()}:${sh(returnStdout: true, script: 'echo $PROMETHEUS_PORT').trim()}

Astuce: Pour accéder à tous les namespaces dans K9s:
   k9s --all-namespaces
"""
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
                        
                        echo "Cleaning up monitoring..."
                        helm uninstall $HELM_RELEASE_NAME -n monitoring || true
                        kubectl delete namespace monitoring --ignore-not-found=true || true
                        
                        echo "Rollback completed"
                    '''
                }
            }
        }
        always {
            sh 'docker logout $REGISTRY || true'
            echo "Pipeline execution completed with status: ${currentBuild.result ?: 'SUCCESS'}"
            script {
                // Clean up workspace
                deleteDir()
            }
        }
    }
}