// MGI PRO · envio das notificações (Cloud Function agendada, roda dentro do Firebase, sem chave)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const AL = require("./alertas-core.cjs");
admin.initializeApp();

async function enviar() {
  const db = admin.firestore();
  const agora = Date.now();
  const b = AL.brt(agora);
  if (b.h < 7 || b.h >= 21) return "fora do horário";
  const docs = await db.collection("dados").get();
  let total = 0;
  for (const doc of docs.docs) {
    const D = doc.data() || {};
    const notif = (D.notif || []).filter(x => x && !(D.removidos || {})[x.id]);
    const pessoas = notif.filter(x => x.tipo === "pessoa");
    const aparelhos = notif.filter(x => x.tipo === "aparelho" && x.push && x.token);
    if (!aparelhos.length) continue;
    const refEnv = db.collection("notifEnvio").doc(doc.id);
    const env = (await refEnv.get()).data() || {};
    const enviados = env.enviados || {};
    const ultimo = env.ultimo || 0;
    const ruins = new Set(env.tokensRuins || []);
    const porPessoa = {};
    for (const a of aparelhos) { if (ruins.has(a.token)) continue; const k = a.uid || a.email; (porPessoa[k] = porPessoa[k] || { email: a.email, tokens: [] }).tokens.push(a.token); }
    for (const [k, p] of Object.entries(porPessoa)) {
      const pref = pessoas.find(x => x.uid === k || x.id === k || x.email === p.email) || {};
      const prefs = Object.assign({ nc: true, dds: true, diario: true, lib: true, rasc: true, mat: true, novo: false, venc: true }, pref.prefs || {});
      const ja = enviados[k] || (enviados[k] = {});
      const A = AL.calcular(D, agora, ultimo, p.email).filter(a => prefs[a.tipo] !== false && !ja[a.chave]);
      if (!A.length) continue;
      const empresa = (D.empresaCfg && D.empresaCfg.nome) || "";
      const msgs = A.length > 3
        ? [{ titulo: "🔔 " + A.length + " avisos no MGI PRO", corpo: A.slice(0, 3).map(a => a.titulo).join(" · "), chave: "resumo|" + agora, url: "app.html", wa: AL.textoWhats(A, empresa) }]
        : A.map(a => Object.assign({}, a, { wa: AL.textoWhats([a], empresa) }));
      for (const m of msgs) {
        const r = await admin.messaging().sendEachForMulticast({
          tokens: p.tokens,
          data: { title: m.titulo, body: m.corpo, url: m.url || "app.html", tag: String(m.chave).slice(0, 60), wa: String(m.wa || "").slice(0, 1500) },
          webpush: { headers: { Urgency: "high", TTL: "21600" } }
        });
        r.responses.forEach((x, i) => { const c = (x.error && x.error.code) || ""; if (!x.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(c)) ruins.add(p.tokens[i]); });
        total += r.successCount;
      }
      A.forEach(a => { ja[a.chave] = agora; });
    }
    for (const k of Object.keys(enviados)) for (const c of Object.keys(enviados[k])) if (agora - enviados[k][c] > 10 * 864e5) delete enviados[k][c];
    await refEnv.set({ enviados, ultimo: agora, tokensRuins: [...ruins].slice(-200), atualizadoEm: admin.firestore.FieldValue.serverTimestamp() });
  }
  return "enviadas: " + total;
}

exports.mgiAlertas = onSchedule({ schedule: "every 30 minutes", timeZone: "America/Sao_Paulo", region: "southamerica-east1", memory: "256MiB", timeoutSeconds: 120 }, async () => {
  const r = await enviar();
  logger.info("MGI alertas: " + r);
});
