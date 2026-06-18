#!/bin/bash
# =============================================================================
# auditoria-semanal.sh — AUDITORIA HONESTA SEMANAL (WLC / @laisemesquita)
# -----------------------------------------------------------------------------
# O QUE FAZ (roda toda SEXTA 09:00 via launchd, ou manualmente):
#   1. Backup do index.html  -> index.html.bak
#   2. Refetch Apify (IG + TikTok) e atualiza dados.json + re-embute index.html
#         (atualizar-dados.mjs). YouTube é preservado (sem API garantida).
#   3. Re-renderiza o PNG do dashboard (puppeteer global via NODE_PATH).
#   4. Escreve a auditoria honesta em auditorias/AAAA-MM-DD-auditoria-semanal.md
#         - via Claude CLI headless (prompt-auditoria-semanal.md)
#         - FALLBACK por template se o `claude` CLI não estiver no PATH.
#   5. Abre o dashboard no Google Chrome (desativável — ver ABRIR_NO_CHROME).
#
# NUNCA inventa métricas. Fonte que falha vira "indisponível" e o job segue.
# Segredos (APIFY_API_TOKEN) nunca são impressos sem máscara.
#
# -----------------------------------------------------------------------------
# COMO RODAR MANUALMENTE:
#     bash auditoria-semanal.sh
#
# COMO LIGAR/DESLIGAR O AGENDAMENTO (launchd):
#     Ligar:    launchctl load   ~/Library/LaunchAgents/com.wewiki.auditoria-wlc-semanal.plist
#     Desligar: launchctl unload ~/Library/LaunchAgents/com.wewiki.auditoria-wlc-semanal.plist
#     Status:   launchctl list | grep auditoria-wlc
#
# DESATIVAR "abrir no Chrome": mude ABRIR_NO_CHROME=true para false abaixo.
# =============================================================================

set -uo pipefail

# ---- configuração ----
ABRIR_NO_CHROME=true   # false = não abre o navegador ao final
PROJ="/Users/laisemesquita/Library/Mobile Documents/com~apple~CloudDocs/WeWiki/Entregas/dashboard-instagram-laisemesquita"
export NODE_PATH="${NODE_PATH:-/opt/homebrew/lib/node_modules}"
PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/Library/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
export PATH

cd "$PROJ" || { echo "ERRO: pasta do projeto não encontrada"; exit 1; }
mkdir -p auditorias

HOJE="$(date +%F)"          # AAAA-MM-DD
MD="auditorias/${HOJE}-auditoria-semanal.md"
ts() { date '+%Y-%m-%d %H:%M:%S'; }
say() { echo "[$(ts)] $*"; }

say "===== AUDITORIA SEMANAL WLC — início ($HOJE) ====="

# token mascarado no log (nunca em claro)
if [ -n "${APIFY_API_TOKEN:-}" ]; then
  say "APIFY_API_TOKEN presente: ${APIFY_API_TOKEN:0:6}…${APIFY_API_TOKEN: -4}"
else
  say "AVISO: APIFY_API_TOKEN ausente — fetch de IG/TikTok vai falhar (plataformas ficarão 'indisponível')."
fi

# ---- 1. backup ----
if [ -f index.html ]; then
  cp -f index.html index.html.bak
  say "Backup criado: index.html.bak"
fi

# ---- 2. fetch + atualizar dados + re-embutir ----
say "Atualizando dados (Apify IG + TikTok) e re-embutindo no index.html…"
NODE_OUT="$(node atualizar-dados.mjs 2>&1)"
NODE_RC=$?
echo "$NODE_OUT"
RESULTADO_JSON="$(printf '%s\n' "$NODE_OUT" | grep '^RESULTADO_JSON=' | tail -1 | sed 's/^RESULTADO_JSON=//')"

if [ $NODE_RC -ne 0 ]; then
  say "AVISO: atualizar-dados.mjs retornou erro (rc=$NODE_RC). Restaurando index.html do backup por segurança."
  [ -f index.html.bak ] && cp -f index.html.bak index.html
  # segue mesmo assim para tentar render/auditoria com os dados que houver
fi

# ---- 3. re-render PNG ----
say "Re-renderizando PNG (puppeteer)…"
if node render.js; then
  say "PNG re-renderizado: dashboard-instagram-laisemesquita.png"
else
  say "AVISO: render.js falhou — PNG pode estar desatualizado."
fi

# ---- 4. auditoria honesta (.md) ----
write_fallback_md() {
  # gera resumo simples por template a partir do RESULTADO_JSON do node + dados.json
  say "Gerando auditoria por TEMPLATE (fallback — claude CLI ausente ou falhou)."
  local diasMeta
  diasMeta=$(( ( $(date -j -f "%Y-%m-%d" "2026-09-30" +%s) - $(date +%s) ) / 86400 ))
  {
    echo "# Auditoria honesta semanal — WLC ($HOJE)"
    echo ""
    echo "> Gerada por TEMPLATE de fallback (o \`claude\` CLI não estava disponível neste run)."
    echo "> Faltam **${diasMeta} dias** para a meta de 100 comentários/post (30/09/2026)."
    echo ""
    echo "## Crescimento de seguidores (semana)"
    if command -v jq >/dev/null 2>&1; then
      for plat in instagram tiktok youtube; do
        local atual delta
        atual=$(jq -r ".plataformas.$plat.seguidores // .plataformas.$plat.inscritos // \"?\"" dados.json)
        delta=$(jq -r ".plataformas.$plat.historicoSeguidores | if length>=2 then (.[-1].seguidores - .[-2].seguidores) else \"sem 2º ponto\" end" dados.json 2>/dev/null)
        echo "- **${plat}**: ${atual} seguidores (Δ semana: ${delta})"
      done
    fi
    echo ""
    echo "## Meta dos 100 comentários (posts recentes)"
    if command -v jq >/dev/null 2>&1; then
      for plat in instagram tiktok; do
        local bateram naobateram
        bateram=$(jq "[.plataformas.$plat.conteudo[] | select((.viral//false)==false) | select((.comments//0)>=100)] | length" dados.json)
        naobateram=$(jq "[.plataformas.$plat.conteudo[] | select((.viral//false)==false) | select((.comments//0)<100)] | length" dados.json)
        echo "- **${plat}**: ${bateram} post(s) ≥100 comentários · ${naobateram} post(s) abaixo de 100."
      done
      echo "- **youtube**: medição de comentários por vídeo indisponível (sem API)."
    fi
    echo ""
    echo "## Resultado do fetch desta semana"
    echo '```json'
    echo "${RESULTADO_JSON:-{}}"
    echo '```'
    echo ""
    echo "## Próximos passos"
    echo "1. Conferir os posts abaixo de 100 comentários e reforçar CTA de comentário."
    echo "2. Manter o hábito: 3 conteúdos/dia, manhã para câmera."
    echo "3. Priorizar crescimento no TikTok (menor conta, maior espaço)."
  } > "$MD"
  say "Auditoria (fallback) escrita: $MD"
}

if command -v claude >/dev/null 2>&1; then
  say "Escrevendo auditoria via Claude CLI headless…"
  if claude -p "$(cat prompt-auditoria-semanal.md)" --permission-mode acceptEdits >> "auditorias/launchd.log" 2>&1; then
    if [ -f "$MD" ]; then
      say "Auditoria escrita pelo Claude: $MD"
    else
      say "Claude rodou mas o .md esperado não apareceu — usando fallback."
      write_fallback_md
    fi
  else
    say "Claude CLI falhou (rc=$?) — usando fallback."
    write_fallback_md
  fi
else
  say "claude CLI não está no PATH — usando fallback."
  write_fallback_md
fi

# ---- 5. abrir no Chrome ----
if [ "$ABRIR_NO_CHROME" = "true" ]; then
  say "Abrindo dashboard no Google Chrome…"
  open -a "Google Chrome" "$PROJ/index.html" 2>/dev/null \
    || say "AVISO: não foi possível abrir o Chrome (run headless?) — abra index.html manualmente."
else
  say "ABRIR_NO_CHROME=false — pulando abertura do navegador."
fi

say "===== AUDITORIA SEMANAL WLC — fim ====="
