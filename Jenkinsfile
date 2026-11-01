// Publish blog-sync's own blog series (blog/*.md) to Ghost.
//
// Assumes a Multibranch Pipeline job (so env.BRANCH_NAME is populated by
// the `when { branch 'main' }` guard below). Modelled on the finance-system
// "Sync blog" stage, minus everything to do with building and deploying an
// app: this repo has nothing to ship, so the blog is the whole pipeline and
// there's no catchError - a failed sync should turn the build red.
//
// --apply creates missing posts as drafts and updates changed ones without
// touching a post's published/draft status; --schedule --apply then queues
// any posts still sitting as drafts, one every other day at 09:00 London
// time, after this series' last scheduled post (other projects' posts are
// ignored, so each project keeps its own cadence). So a post merged to main
// goes live on its own a few days later - to hold one back, don't merge it. --pull rewrites local markdown, which cleanWs()
// would discard, so it's left to run by hand.
//
// blog-sync runs from this checkout (`uv run`), so the pipeline always tests
// the code it's about to publish with; other projects pin a release tag
// instead. uv is bootstrapped inline rather than assumed on the agent. The
// two Ghost credentials (ghost-url, ghost-admin-key) are global Jenkins
// secret-text credentials - see docs/jenkins.md.

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        PATH = "${env.HOME}/.local/bin:${env.PATH}"
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    def scmVars = checkout scm
                    echo "Branch: ${scmVars.GIT_BRANCH} (env.BRANCH_NAME: ${env.BRANCH_NAME})"
                }
            }
        }

        stage('Install uv') {
            steps {
                sh 'curl -LsSf https://astral.sh/uv/install.sh | sh'
            }
        }

        // Syncs blog/*.md to Ghost after the deploy, so a blog problem can
        // never hold up shipping the app (catchError marks the build
        // UNSTABLE instead of failing it). Sync must precede --schedule:
        // scheduling skips posts that aren't on Ghost yet. See
        // https://github.com/atownsend247/ghost-blog-sync (docs/jenkins.md).
        // Needs the global Secret text credentials `ghost-url` and
        // `ghost-admin-key`; uvx comes from the Install uv stage above.
        stage('Sync blog') {
            when {
                branch 'main'
            }
            steps {
                catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
                    withCredentials([
                        string(credentialsId: 'ghost-url', variable: 'GHOST_URL'),
                        string(credentialsId: 'ghost-admin-key', variable: 'GHOST_ADMIN_KEY'),
                    ]) {
                        sh '''
                            run_blog() {
                                uvx --from git+https://github.com/atownsend247/ghost-blog-sync.git@v0.2.0 blog-sync "$@"
                            }
                            run_blog --apply
                            run_blog --schedule --apply
                        '''
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
