#!/bin/bash
# ============================================================
# MySQL 双库定时备份脚本
# 每天凌晨 3:00 执行，备份两个库后压缩上传 OSS
#
# 使用方式：
#   1. 放在 /opt/rap-beats/scripts/backup.sh
#   2. 添加 cron 任务：crontab -e
#      0 3 * * * /opt/rap-beats/scripts/backup.sh >> /var/log/rap-beats/backup.log 2>&1
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

BACKUP_DIR="/opt/rap-beats/backups"
OSS_BUCKET="${OSS_BUCKET:-}"
OSS_REGION="${OSS_REGION:-oss-cn-hangzhou}"
OSS_ENDPOINT="${OSS_ENDPOINT:-https://oss-cn-hangzhou.aliyuncs.com}"
OSS_ACCESS_KEY_ID="${OSS_ACCESS_KEY_ID:-}"
OSS_ACCESS_KEY_SECRET="${OSS_ACCESS_KEY_SECRET:-}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-rap_beats}"
FORUM_DB_NAME="${FORUM_DB_NAME:-rap_beats_forum}"

log()  { echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error(){ echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S') ERROR]${NC} $1" >&2; exit 1; }

# 检查必要参数
if [ -z "$DB_PASSWORD" ]; then
    error "请设置环境变量 DB_PASSWORD"
fi

if [ -z "$OSS_ACCESS_KEY_ID" ] || [ -z "$OSS_ACCESS_KEY_SECRET" ]; then
    log "OSS 凭证未配置，跳过上传步骤（仅本地备份）"
    SKIP_OSS=true
fi

mkdir -p "$BACKUP_DIR"

# 计算日期
DATE=$(date '+%Y%m%d')
WEEKDAY=$(date '+%u')  # 1=周一

log "=== 开始备份 MySQL 双库 ==="

# 备份主库
BACKUP_FILE_MAIN="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"
log "备份主库 ${DB_NAME}..."
docker exec rap-beats-mysql sh -c "exec mysqldump -uroot -p'$DB_PASSWORD' --single-transaction --quick --lock-tables=false --default-character-set=utf8mb4 '$DB_NAME'" \
    | gzip > "$BACKUP_FILE_MAIN"
log "主库备份完成: $BACKUP_FILE_MAIN ($(du -h $BACKUP_FILE_MAIN | cut -f1))"

# 备份论坛库
BACKUP_FILE_FORUM="${BACKUP_DIR}/${FORUM_DB_NAME}_${DATE}.sql.gz"
log "备份论坛库 ${FORUM_DB_NAME}..."
docker exec rap-beats-mysql sh -c "exec mysqldump -uroot -p'$DB_PASSWORD' --single-transaction --quick --lock-tables=false --default-character-set=utf8mb4 '$FORUM_DB_NAME'" \
    | gzip > "$BACKUP_FILE_FORUM"
log "论坛库备份完成: $BACKUP_FILE_FORUM ($(du -h $BACKUP_FILE_FORUM | cut -f1))"

# 上传 OSS
if [ "$SKIP_OSS" != "true" ]; then
    log "上传备份到 OSS..."
    for file in "$BACKUP_FILE_MAIN" "$BACKUP_FILE_FORUM"; do
        filename=$(basename "$file")
        # 覆盖当天的备份
        ossutil cp "$file" "oss://${OSS_BUCKET}/backups/${filename}" \
            --endpoint "$OSS_ENDPOINT" \
            --access-key-id "$OSS_ACCESS_KEY_ID" \
            --access-key-secret "$OSS_ACCESS_KEY_SECRET" \
            --force > /dev/null 2>&1 && \
            log "已上传: $filename" || \
            error "上传失败: $filename"
    done
fi

# 清理本地旧备份（保留 7 天）
log "清理超过 7 天的本地备份..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
log "本地备份清理完成"

# 每周日凌晨删除 OSS 上的旧备份（保留 30 天）
if [ "$WEEKDAY" = "7" ] && [ "$SKIP_OSS" != "true" ]; then
    log "清理 OSS 上超过 30 天的备份..."
    DEADLINE=$(date -d '30 days ago' '+%Y%m%d')
    for dbname in "$DB_NAME" "$FORUM_DB_NAME"; do
        ossutil ls "oss://${OSS_BUCKET}/backups/${dbname}_" \
            --endpoint "$OSS_ENDPOINT" \
            --access-key-id "$OSS_ACCESS_KEY_ID" \
            --access-key-secret "$OSS_ACCESS_KEY_SECRET" \
            2>/dev/null | while read -r obj; do
            # 从路径提取日期，格式如 rap_beats_20240501.sql.gz
            fname=$(echo "$obj" | grep -oE "${dbname}_[0-9]{8}\.sql\.gz")
            if [ -n "$fname" ]; then
                fdate=$(echo "$fname" | grep -oE '[0-9]{8}')
                if [ "$fdate" -lt "$DEADLINE" ] 2>/dev/null; then
                    ossutil rm "oss://${OSS_BUCKET}/backups/${fname}" \
                        --endpoint "$OSS_ENDPOINT" \
                        --access-key-id "$OSS_ACCESS_KEY_ID" \
                        --access-key-secret "$OSS_ACCESS_KEY_SECRET" \
                        --force > /dev/null 2>&1 && \
                        log "已删除 OSS 旧备份: $fname"
                fi
            fi
        done
    done
fi

log "=== 备份任务完成 ==="
