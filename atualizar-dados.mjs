#!/usr/bin/env node
/* ============================================================
 * atualizar-dados.mjs — núcleo da auditoria semanal WLC
 * ------------------------------------------------------------
 * O QUE FAZ (chamado por auditoria-semanal.sh):
 *   1. Refetch via Apify: perfil + posts recentes de Instagram
 *      (@laisemesquita) e TikTok (@laisemesquita).
 *   2. Atualiza dados.json:
 *        - append de snapshot do dia em historicoSeguidores
 *          (IG e TikTok; só cresce, nunca duplica a data).
 *        - atualiza a lista `conteudo` com posts recentes,
 *          PRESERVANDO os virais históricos (viral:true).
 *      YouTube: NÃO é tocado por este script (sem API garantida);
 *      seus campos ficam como estão — não inventamos números.
 *   3. Re-embute dados.json + meta.json dentro do index.html
 *      usando marcadores de comentario no HTML (DADOS_START/DADOS_END
 *      e META_START/META_END) — ver funcao reembutir().
 *
 * NUNCA inventa métricas. Se uma fonte falhar, marca a plataforma
 * como indisponível, NÃO appenda snapshot falso e segue.
 *
 * Segredo: APIFY_API_TOKEN nunca é impresso (mascarado em todo log).
 * ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DADOS_PATH = path.join(__dirname, 'dados.json');
const META_PATH = path.join(__dirname, 'meta.json');
const INDEX_PATH = path.join(__dirname, 'index.html');

const TOKEN = process.env.APIFY_API_TOKEN || '';
const HOJE = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
const MAX_POSTS = 12; // mantém ~12 recentes por plataforma (+ virais históricos)

const mask = (t) => (t ? `${t.slice(0, 6)}…${t.slice(-4)}` : '(vazio)');
const log = (...a) => console.log('[atualizar-dados]', ...a);

// resumo de execução que o runner shell lê do stdout final (JSON numa linha)
const resultado = {
  data: HOJE,
  instagram: { status: 'pendente', deltaSeguidores: null, postsAtualizados: 0 },
  tiktok: { status: 'pendente', deltaSeguidores: null, postsAtualizados: 0 },
  youtube: { status: 'intocado', nota: 'sem API garantida — campos preservados' },
  indexReembutido: false,
  pngPendente: true,
};

// ---------- Apify ----------
async function apifyRun(actor, input, timeoutMs = 280000) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items)) throw new Error('resposta não é array');
    return items;
  } finally {
    clearTimeout(timer);
  }
}

// ---------- helpers de conteúdo ----------
function mergeConteudo(antigos, novos) {
  // preserva virais históricos; novos posts recentes substituem o resto.
  const virais = antigos.filter((p) => p.viral === true);
  const chave = (p) => `${p.date}::${(p.text || '').slice(0, 40)}`;
  const setVirais = new Set(virais.map(chave));
  const recentesLimpos = novos.filter((p) => !setVirais.has(chave(p)));
  // ordena recentes por plays desc para a tabela do dashboard
  recentesLimpos.sort((a, b) => (b.plays || 0) - (a.plays || 0));
  return [...virais, ...recentesLimpos.slice(0, MAX_POSTS)];
}

function appendSnapshot(historico, seguidores) {
  // só cresce; se já existe a data de hoje, atualiza o número (re-run no mesmo dia)
  const idx = historico.findIndex((h) => h.data === HOJE);
  if (idx >= 0) historico[idx].seguidores = seguidores;
  else historico.push({ data: HOJE, seguidores });
  return historico;
}

// ---------- TikTok ----------
async function fetchTikTok() {
  log('TikTok: buscando perfil + vídeos de @laisemesquita…');
  const items = await apifyRun('clockworks~free-tiktok-scraper', {
    profiles: ['laisemesquita'],
    resultsPerPage: MAX_POSTS,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
  });
  if (!items.length) throw new Error('nenhum item retornado');
  const author = items.find((i) => i.authorMeta && typeof i.authorMeta.fans === 'number')?.authorMeta;
  if (!author) throw new Error('authorMeta/fans ausente');
  const conteudo = items
    .filter((i) => i.id && typeof i.playCount === 'number')
    .map((i) => ({
      plays: i.playCount ?? 0,
      likes: i.diggCount ?? 0,
      comments: i.commentCount ?? 0,
      shares: i.shareCount ?? 0,
      dur: i.videoMeta?.duration ?? 0,
      date: (i.createTimeISO || '').slice(0, 10),
      text: (i.text || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    }));
  return {
    seguidores: author.fans,
    curtidasTotais: author.heart ?? null,
    videos: author.video ?? null,
    verificado: !!author.verified,
    conteudo,
  };
}

// ---------- Instagram ----------
async function fetchInstagram() {
  log('Instagram: buscando perfil + posts de @laisemesquita…');
  const items = await apifyRun('apify~instagram-scraper', {
    directUrls: ['https://www.instagram.com/laisemesquita/'],
    resultsType: 'posts',
    resultsLimit: MAX_POSTS,
    addParentData: true,
  });
  if (!items.length) throw new Error('nenhum item retornado');
  const withProfile = items.find((i) => typeof i.followersCount === 'number');
  if (!withProfile) throw new Error('followersCount ausente');
  const conteudo = items
    .filter((i) => i.shortCode || i.id)
    .map((i) => ({
      plays: i.videoPlayCount ?? i.videoViewCount ?? null, // null p/ imagens (não inventamos plays)
      likes: i.likesCount ?? 0,
      comments: i.commentsCount ?? 0,
      dur: i.videoDuration != null ? Math.round(i.videoDuration) : 0,
      date: (i.timestamp || '').slice(0, 10),
      text: (i.caption || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    }));
  return {
    seguidores: withProfile.followersCount,
    posts: withProfile.postsCount ?? null,
    verificado: !!withProfile.verified,
    conteudo,
  };
}

// ---------- re-embutir no index.html ----------
function reembutir(html, marcadorInicio, marcadorFim, jsonStr) {
  const start = `/*${marcadorInicio}*/`;
  const end = `/*${marcadorFim}*/`;
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i < 0 || j < 0 || j < i) {
    throw new Error(`marcadores ${start}/${end} não encontrados no index.html`);
  }
  return html.slice(0, i + start.length) + jsonStr + html.slice(j);
}

// ============================================================
async function main() {
  log(`Início — data ${HOJE}, token ${mask(TOKEN)}`);
  if (!TOKEN) throw new Error('APIFY_API_TOKEN ausente no ambiente');

  const dados = JSON.parse(await readFile(DADOS_PATH, 'utf8'));
  const P = dados.plataformas;

  // ---- TikTok ----
  try {
    const tt = await fetchTikTok();
    const antes = P.tiktok.seguidores;
    P.tiktok.seguidores = tt.seguidores;
    if (tt.curtidasTotais != null) P.tiktok.curtidasTotais = tt.curtidasTotais;
    if (tt.videos != null) P.tiktok.videos = tt.videos;
    P.tiktok.verificado = tt.verificado;
    P.tiktok.historicoSeguidores = appendSnapshot(P.tiktok.historicoSeguidores || [], tt.seguidores);
    if (tt.conteudo.length) P.tiktok.conteudo = mergeConteudo(P.tiktok.conteudo || [], tt.conteudo);
    resultado.tiktok = {
      status: 'ok',
      deltaSeguidores: tt.seguidores - antes,
      postsAtualizados: tt.conteudo.length,
    };
    log(`TikTok OK — seguidores ${antes} → ${tt.seguidores} (Δ ${tt.seguidores - antes}), ${tt.conteudo.length} posts`);
  } catch (e) {
    resultado.tiktok = { status: 'indisponível', erro: String(e.message || e), deltaSeguidores: null, postsAtualizados: 0 };
    log(`TikTok INDISPONÍVEL — ${e.message || e} (snapshot NÃO appendado)`);
  }

  // ---- Instagram ----
  try {
    const ig = await fetchInstagram();
    const antes = P.instagram.seguidores;
    P.instagram.seguidores = ig.seguidores;
    if (ig.posts != null) P.instagram.posts = ig.posts;
    P.instagram.verificado = ig.verificado;
    P.instagram.historicoSeguidores = appendSnapshot(P.instagram.historicoSeguidores || [], ig.seguidores);
    if (ig.conteudo.length) P.instagram.conteudo = mergeConteudo(P.instagram.conteudo || [], ig.conteudo);
    resultado.instagram = {
      status: 'ok',
      deltaSeguidores: ig.seguidores - antes,
      postsAtualizados: ig.conteudo.length,
    };
    log(`Instagram OK — seguidores ${antes} → ${ig.seguidores} (Δ ${ig.seguidores - antes}), ${ig.conteudo.length} posts`);
  } catch (e) {
    resultado.instagram = { status: 'indisponível', erro: String(e.message || e), deltaSeguidores: null, postsAtualizados: 0 };
    log(`Instagram INDISPONÍVEL — ${e.message || e} (snapshot NÃO appendado)`);
  }

  // YouTube: preservado intencionalmente (sem API garantida no runner)
  log('YouTube: preservado (sem API garantida em run headless) — campos intocados.');

  // ---- gravar dados.json ----
  dados.geradoEm = HOJE;
  await writeFile(DADOS_PATH, JSON.stringify(dados, null, 2) + '\n', 'utf8');
  log('dados.json gravado.');

  // ---- re-embutir no index.html (DADOS minificado + META do meta.json) ----
  let html = await readFile(INDEX_PATH, 'utf8');
  const dadosMin = JSON.stringify(dados); // minificado, 1 linha (como o original)
  html = reembutir(html, 'DADOS_START', 'DADOS_END', dadosMin);

  if (existsSync(META_PATH)) {
    const meta = JSON.parse(await readFile(META_PATH, 'utf8'));
    const metaPretty = JSON.stringify(meta, null, 2);
    html = reembutir(html, 'META_START', 'META_END', metaPretty);
    log('META re-embutido a partir de meta.json.');
  }
  await writeFile(INDEX_PATH, html, 'utf8');
  resultado.indexReembutido = true;
  log('index.html re-embutido (DADOS + META).');

  // resumo para o shell (última linha, prefixo RESULTADO_JSON=)
  console.log('RESULTADO_JSON=' + JSON.stringify(resultado));
}

main().catch((e) => {
  console.error('[atualizar-dados] ERRO FATAL:', e.message || e);
  console.log('RESULTADO_JSON=' + JSON.stringify({ ...resultado, erroFatal: String(e.message || e) }));
  process.exit(1);
});
