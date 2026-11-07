# GitHub Actions JAR 빌드와 EC2 자동 배포

이 구성은 GitHub 호스팅 러너에서 Java 21/PostgreSQL 통합 테스트와 JAR 빌드를 수행한다. 배포를 켜면 비공개 S3에 번들을 올리고 Systems Manager(SSM)로 기존 EC2의 fieldwork 서비스를 교체한다. EC2에 소스/Gradle/Docker 빌드 환경이나 GitHub 러너를 설치하지 않는다. 회사 PC의 PEM, SSH 공개, 장기 AWS 액세스 키는 필요 없다.

프론트는 기존 Cloudflare 배포를 유지한다. 이 워크플로는 backend.env, PostgreSQL, Tunnel을 변경하지 않는다.

## 1. 먼저 master에 반영하고 JAR 빌드

PR을 develop에 병합한 뒤 master에 반영한다. `Backend Release`는 master의 backend/deploy/워크플로 변경 시 실행되고 Actions에서 수동 실행도 가능하다.

GitHub → Actions → Backend Release → 성공한 실행 → Artifacts → `backend-커밋SHA`를 내려받는다. ZIP 안의 `backend-release.tar.gz`를 풀면 `fieldwork.jar`와 배포 스크립트가 있다. 테스트가 실패하면 산출물 생성/배포를 진행하지 않는다.

`EC2_DEPLOY_ENABLED`가 없거나 false면 빌드만 수행하며 deploy는 skipped다. AWS 설정이 없어도 이 단계는 가능하다. 수동 실행은 master에서 선택한다.

## 2. AWS 리소스 준비 (일회성)

저장소 `deploy/aws-deployment-stack.yml`을 다운로드한다. EC2와 같은 리전의 AWS CloudFormation 콘솔에서 **스택 생성 → 새 리소스 사용 → 템플릿 파일 업로드**로 올린다.

- 스택 이름: `fieldwork-deploy`
- InstanceId: 기존 EC2의 `i-...` ID. 퍼블릭 IP가 아니다.
- GitHubRepository: `issac-52/field-worker`
- ExistingGitHubOidcProviderArn: IAM → ID 제공업체에 `token.actions.githubusercontent.com`이 이미 있으면 그 ARN을 입력한다. 없으면 빈 값으로 두어 생성한다. 계정에 같은 제공업체를 중복 생성할 수 없다.
- 검토 화면에서 IAM 리소스 생성 동의를 확인하고 생성한다.

템플릿은 비공개 S3, GitHub 배포용 IAM 역할, EC2용 SSM/S3 읽기 역할·인스턴스 프로파일만 만든다. 기존 EC2/DB/보안 그룹에는 자동 변경을 가하지 않는다. S3는 저장/요청 비용이 있으며 90일 보관 정책, 버전 보관과 퍼블릭 접근 차단을 적용한다. 스택 삭제 시 버킷은 보존된다.

생성이 끝나면 Outputs를 기록한다: AWSRegion, DeployBucket, GitHubDeployRoleArn, EC2InstanceId, EC2InstanceProfile, EC2RoleName.

## 3. EC2에 SSM 권한 연결

EC2 → 해당 인스턴스 → 작업 → 보안 → IAM 역할 수정에서 생성한 인스턴스 프로파일을 연결한다. **이미 업무용 IAM 역할이 연결되어 있다면 그대로 교체하지 않는다.** 기존 역할에 AmazonSSMManagedInstanceCore 및 이번 S3 버킷 `backend/*`의 s3:GetObject 권한을 추가하는 방식으로 기존 권한을 보존한다.

EC2 브라우저 터미널에서 SSM Agent 상태를 확인한다.

```bash
sudo systemctl status amazon-ssm-agent --no-pager
sudo snap services amazon-ssm-agent
```

둘 중 설치된 방식으로 실행한다. Ubuntu에서 둘 다 없다면:

```bash
sudo snap install amazon-ssm-agent --classic
sudo snap start amazon-ssm-agent
```

이미 snap 설치돼 있으면 `sudo snap start amazon-ssm-agent`만 실행한다. deb/systemd 설치인 경우 `sudo systemctl enable --now amazon-ssm-agent`를 사용한다. 두 방식을 중복 설치하지 않는다.

AWS Systems Manager → Fleet Manager/관리형 노드에서 해당 인스턴스가 **Online**인지 확인한다. 외부 HTTPS 443 및 SSM/S3 접근이 필요하며 새 인바운드 포트는 필요 없다.

## 4. EC2 AWS CLI 설치

```bash
aws --version
```

이미 AWS CLI v2가 있으면 건너뛴다. 없으면 EC2 터미널에서:

```bash
sudo apt-get update
sudo apt-get install -y unzip curl
case "$(uname -m)" in
  x86_64) AWS_ARCH=x86_64 ;;
  aarch64|arm64) AWS_ARCH=aarch64 ;;
  *) echo '지원하지 않는 CPU'; exit 1 ;;
esac
AWS_INSTALL_DIR=$(mktemp -d)
curl -fL "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" -o "$AWS_INSTALL_DIR/awscliv2.zip"
unzip -q "$AWS_INSTALL_DIR/awscliv2.zip" -d "$AWS_INSTALL_DIR"
sudo "$AWS_INSTALL_DIR/aws/install" --update
aws --version
```

`aws configure`로 액세스 키를 입력하지 않는다. EC2에 연결한 IAM 역할을 사용한다. SSM은 root로 실행되므로 `/usr/local/bin/aws` 또는 PATH에서 `aws`를 찾을 수 있어야 한다.

기존 `/opt/field-work/backend.env` 및 fieldwork 계정/systemd 서비스, Java 21이 준비돼 있어야 한다. NAVER/R2/DB 비밀값은 기존 서버 파일에 유지한다.

## 5. GitHub 환경과 변수 설정

GitHub 저장소 → Settings → Environments → New environment에서 **production**을 만든다. Deployment branches and tags는 **Selected branches and tags → master만 허용**한다. OIDC 역할이 이 환경을 신뢰하므로 이 제한을 함께 적용한다. 검토 승인자를 지정할 수 있지만, 완전 자동 배포를 원하면 필수 승인자는 설정하지 않는다.

Settings → Secrets and variables → Actions → **Variables** → New repository variable에서 등록한다. 아래 값은 비밀번호가 아닌 구성값이다.

| 변수 | CloudFormation Outputs 값 |
| --- | --- |
| AWS_REGION | AWSRegion (예: ap-northeast-2) |
| DEPLOY_BUCKET | DeployBucket |
| EC2_INSTANCE_ID | EC2InstanceId |
| AWS_DEPLOY_ROLE_ARN | GitHubDeployRoleArn |
| EC2_DEPLOY_ENABLED | 처음에는 `false` |

특히 EC2_DEPLOY_ENABLED는 **repository variable**로 만든다. job 실행 전 조건에서 읽으므로 environment 변수에만 넣으면 배포가 켜지지 않는다.

AWS 장기 액세스 키나 SSH PEM은 GitHub에 등록하지 않는다.

## 6. 최초 자동 배포

SSM Online 및 기존 서버 설정 확인 후 EC2_DEPLOY_ENABLED를 `true`로 변경한다.

Actions → Backend Release → Run workflow → **master** 선택 → 실행.

1. GitHub 러너에서 테스트·JAR 생성
2. Artifact 저장 및 SHA-256 검증
3. OIDC로 배포 역할 획득 → 비공개 S3 업로드
4. SSM으로 EC2가 번들을 다운로드하고 SHA-256 재확인
5. 기존 JAR 백업 → 새 JAR 원자적 교체 → fieldwork 재시작
6. `/api/health`의 HTTP 성공과 `status=ok` 확인

배포 실패 시 Actions는 실패 처리한다. 교체/시작/health 실패 시 이전 JAR 복구와 서비스 재시작을 시도한다. 백업은 `/opt/field-work/releases/before-커밋SHA-실행ID-시도번호.jar`에 남긴다. 서비스 교체 동안 짧은 중단이 있다. DB 마이그레이션은 자동 롤백하지 않으므로 향후 마이그레이션은 구버전 호환성과 DB 백업을 별도 검토한다. health는 업무 기능/R2까지 검증하는 테스트가 아니다.

새 JAR 준비/설정 검증 단계에서 실패하면 기존 서비스는 그대로 둔다. 동시 배포는 GitHub concurrency와 EC2 파일 잠금으로 막는다. 설치 스크립트의 마지막 로그에 성공한 release ID를 출력하며 `/opt/field-work/releases/current-release`에도 기록한다. 복구 후 애플리케이션 정상 여부는 EC2에서 확인한다.

## 7. 운영 확인

```bash
sudo systemctl status fieldwork --no-pager
curl -i http://127.0.0.1:8080/api/health
cat /opt/field-work/releases/current-release
```

프론트 주소의 `/api/health`, 로그인, 상세정보, Geocoding 소량 실행도 확인한다. 임시 Tunnel은 서버 재부팅 시 주소가 바뀔 수 있다. 이 워크플로는 Tunnel 주소/Cloudflare 변수는 변경하지 않는다. 고정 운영에는 별도 도메인과 named Tunnel 구성이 필요하다.

## 검증 범위

로컬에서 배포 성공/실패 복구/최초 배포 실패, 릴리스 입력 검증, 번들 변조 거부, 다운로드 후 체크섬 검증 순서 등 배포 스크립트 테스트를 실행한다. systemctl/curl은 대역이며 운영 EC2 배포 테스트는 아니다. 실제 GitHub OIDC/SSM/S3 통합은 위 계정 설정과 최초 Actions 실행 후 확인해야 한다.

구현 시 실행한 검증: `python3 -m unittest discover -s deploy/tests -v` 7개 통과, `bash -n deploy/install-release.sh` 통과, actionlint 1.7.7 전체 workflow 검사 통과, workflow/CloudFormation YAML 파싱 및 `git diff --check` 통과. CloudFormation의 실제 AWS 생성 검증과 GitHub Actions 원격 실행은 아직 하지 않았다. 애플리케이션 소스 변경이 없어 이번 작업에서 기존 백엔드 36개 테스트는 재실행하지 않았으며, release workflow가 배포 전에 실행하도록 구성했다.
