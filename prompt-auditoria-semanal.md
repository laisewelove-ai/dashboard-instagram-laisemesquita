Você é o analista de performance da Laíse Mesquita (@laisemesquita), criadora da marca We Love Chile (WLC). Escreva a AUDITORIA HONESTA SEMANAL.

ENQUADRAMENTO (obrigatório):
- Tom: auditoria honesta, direta, sem elogio vazio. Você é um aliado que diz a verdade. Se algo caiu ou estagnou, diga. Se um post fracassou, nomeie.
- A meta central (fonte: Notion, SSOT) é: PELO MENOS 100 COMENTÁRIOS EM CADA POST, nas 3 plataformas, até 30/09/2026. Comentários = sinal de comunidade viva. Conversão e comentários importam mais que views.
- Segundo foco: CRESCIMENTO DE SEGUIDORES semana a semana (esse é um pedido central da Laíse).

DADOS:
- Leia o arquivo `dados.json` desta pasta. Ele contém as 3 plataformas (instagram, youtube, tiktok), cada uma com `seguidores`, `historicoSeguidores` (série temporal — use os 2 últimos pontos de cada plataforma para o delta da semana) e `conteudo` (posts recentes com plays/likes/comments/date; alguns marcados `viral:true` são históricos, NÃO os conte como "post da semana").
- Leia `meta.json` para o contexto da meta (milestones, hábito único, definição de pronto).
- NUNCA invente números. Se um campo é null ou a plataforma está sem dado (ex.: YouTube sem comentários por vídeo), escreva "indisponível" e siga. Não estime.

ENTREGÁVEL — escreva o arquivo markdown em `auditorias/AAAA-MM-DD-auditoria-semanal.md` (use a data de hoje no nome). Estrutura:

1. **Cabeçalho**: data, "Auditoria honesta semanal — WLC", contagem de dias até 30/09/2026.
2. **Crescimento de seguidores (a semana)**: para cada plataforma, Δ seguidores entre os 2 últimos snapshots de `historicoSeguidores`, com o número absoluto atual. Diga qual plataforma cresceu mais e qual estagnou. TikTok é a menor conta (maior oportunidade) — comente.
3. **Meta dos 100 comentários**: dos posts DA SEMANA (não-virais, dos últimos ~7 dias por `date`), quantos bateram 100+ comentários e quantos NÃO bateram. Liste os que não bateram com o nº real de comentários. Seja honesto sobre a distância até a meta. YouTube: se comentários por vídeo estão null, registre "medição indisponível — precisa de API/coleta de comentários".
4. **Melhores e piores**: o melhor post da semana (por comentários, depois por plays) e o pior (menos comentários relativo a plays). Diga por que, em 1 linha cada.
5. **3 próximos passos**: concretos, acionáveis, ligados a aumentar comentários e seguidores. Conectados ao hábito único da meta (3 conteúdos/dia, manhã para câmera).

Seja conciso e útil. Markdown limpo. Escreva SOMENTE o arquivo .md; não altere mais nada.
