pipeline {
    agent any

    environment {
        IMAGE_NAME = "touatifadwa/bibliotheque-api-gateway"
        IMAGE_TAG = "latest"
        REGISTRY = "docker.io"
        KUBE_NAMESPACE = "bibliotheque"
    }

    stages {
        // Étape 1: Récupération du code source
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // Étape 2: Installation des dépendances
        stage('Install Dependencies') {
            steps {
                dir('Micro-Api-Gateway') {
                    sh 'npm ci'
                }
            }
        }

        // Étape 3: Construction de l'application
        stage('Build') {
            steps {
                dir('Micro-Api-Gateway') {
                    sh 'npm run build'
                }
            }
        }

        // Étape 4: Exécution des tests
        stage('Run Tests') {
            steps {
                dir('microservice-auth') {
                    sh 'npm run test'
                }
            }
        }

        // Étape 5: Construction de l'image Docker
        stage('Build Docker Image') {
            steps {
                script {
                    sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
                }
            }
        }

        // Étape 6: Push vers Docker Hub
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

        // Étape 7: Configuration Kubernetes
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
                            mkdir -p ~/.kube
                            cp "$KUBECONFIG_FILE" ~/.kube/config
                            chmod 600 ~/.kube/config

                            kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

                            sed -i "s/{{JWT_SECRET}}/$JWT_SECRET/g" k8s/secrets.yaml
                            sed -i "s/{{DB_USER}}/$DB_USER/g" k8s/secrets.yaml
                            sed -i "s/{{DB_PASSWORD}}/$DB_PASSWORD/g" k8s/secrets.yaml
                            kubectl apply -f k8s/secrets.yaml -n $KUBE_NAMESPACE
                        '''
                    }
                }
            }
        }

        // Étape 8: Déploiement Kubernetes
        stage('Deploy to Kubernetes') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            kubectl apply -f k8s/deployment.yaml -n $KUBE_NAMESPACE
                            kubectl apply -f k8s/service.yaml -n $KUBE_NAMESPACE
                            kubectl rollout status deployment/bibliotheque-api-gateway -n $KUBE_NAMESPACE --timeout=300s
                        '''
                    }
                }
            }
        }

        // Étape 9: Vérification
        stage('Verify Deployment') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            echo "=== Déploiement ==="
                            kubectl get deploy -n $KUBE_NAMESPACE -o wide
                            
                            echo "\n=== Services ==="
                            kubectl get svc -n $KUBE_NAMESPACE -o wide
                            
                            echo "\n=== Pods ==="
                            kubectl get pods -n $KUBE_NAMESPACE -o wide
                            
                            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            NODE_PORT=$(kubectl get svc bibliotheque-api-gateway-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
                            echo "\nURL API Gateway: http://$NODE_IP:$NODE_PORT"
                            
                            curl -sSf "http://$NODE_IP:$NODE_PORT/api/health" || echo "Health check failed"
                        '''
                    }
                }
            }
        }
    }

    post {
        failure {
            script {
                withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                    sh '''
                        mkdir -p ~/.kube
                        cp "$KUBECONFIG_FILE" ~/.kube/config
                        kubectl rollout undo deployment/bibliotheque-api-gateway -n $KUBE_NAMESPACE || true
                    '''
                }
            }
        }
        always {
            sh 'docker logout $REGISTRY || true'
            cleanWs()
        }
    }
}