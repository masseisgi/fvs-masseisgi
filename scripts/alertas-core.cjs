/* MGI PRO · motor de alertas (o mesmo código roda no app e no servidor) */
(function(raiz){
  var DIA=864e5;
  var TIPOS=[
    {id:"nc",    nome:"NC com prazo vencido",              desc:"Ação corretiva de FVS ou auditoria passou do prazo e não foi fechada (aviso às 8h)."},
    {id:"dds",   nome:"DDS do dia não feito",              desc:"Às 9h, se a obra ainda não tem DDS no dia (segunda a sábado)."},
    {id:"diario",nome:"Diário de obra pendente",           desc:"Às 17h, se o diário do dia ainda não foi registrado (segunda a sábado)."},
    {id:"lib",   nome:"Liberação de frente aguardando",    desc:"Liberação em andamento há mais de 1 dia ou não liberada."},
    {id:"rasc",  nome:"Preenchimento esquecido",           desc:"FVS, auditoria, DDS, material ou diário começado e não concluído há mais de 1 dia."},
    {id:"mat",   nome:"Material reprovado no recebimento", desc:"Assim que um recebimento é registrado como reprovado."},
    {id:"novo",  nome:"Registro novo da equipe",           desc:"Alguém da equipe concluiu um DDS, FVS, auditoria ou diário."},
    {id:"venc",  nome:"Documento perto de vencer",         desc:"Documentos do controle com validade em até 15 dias e no dia do vencimento."}
  ];
  function brt(ms){ var d=new Date(ms-3*3600e3); return {iso:d.toISOString().slice(0,10), h:d.getUTCHours(), dow:d.getUTCDay()}; }
  function diasPrazo(q){ q=String(q||"").toLowerCase(); var m=q.match(/(\d+)\s*dia/); if(m) return +m[1]; m=q.match(/(\d+)\s*semana/); if(m) return 7*m[1]; if(/imediat|hoje/.test(q)) return 1; if(/amanh/.test(q)) return 2; return 7; }
  function ms(v){ if(!v) return 0; if(typeof v==="number") return v; if(v&&typeof v.toMillis==="function") return v.toMillis(); if(v&&v._seconds) return v._seconds*1000; var t=Date.parse(v); return isNaN(t)?0:t; }
  function nomeObra(D,id){ var o=(D.obras||[]).find(function(x){ return x.id===id; }); return o?o.nome:"obra"; }
  function autorDe(x){ return String((x&&x._cri&&(x._cri.email||x._cri.por))||(x&&x.autor)||(x&&x.criadoPor)||"").toLowerCase(); }
  function vivo(D,x){ return x&&!(D.removidos||{})[x.id]; }
  function porObra(lista,fn){ var g={}; lista.forEach(function(x){ var k=x.obraId||""; (g[k]=g[k]||[]).push(x); }); Object.keys(g).forEach(function(k){ fn(k||null,g[k]); }); }

  // D = dados da empresa (como estão na nuvem); agora = ms; desde = ms da última verificação; eu = e-mail de quem recebe
  function calcular(D,agora,desde,eu){
    D=D||{}; var A=[], b=brt(agora), hoje=b.iso, util=b.dow>=1&&b.dow<=6; eu=String(eu||"").toLowerCase();
    var obras=(D.obras||[]).filter(function(o){ return o&&!(D.removidos||{})[o.id]&&!o.arquivada&&!o.encerrada; });
    var ctl=D.acoesCtl||{};
    // 1. NC vencida
    if(b.h>=8){ var nc=[];
      [["fvsSalvas","FVS"],["auditoriasSalvas","Auditoria"]].forEach(function(p){ (D[p[0]]||[]).forEach(function(s){ if(!vivo(D,s)) return;
        Object.keys(s.respostas||{}).forEach(function(k){ if(s.respostas[k]!=="NC") return; var id=s.id+"|"+k, c=ctl[id]||{}; if(c.status==="fechada") return;
          var ab=ms(s.savedAt)||agora, ac=(s.acoes||{})[k]; var pz=c.prazo?Date.parse(c.prazo+"T00:00:00-03:00"):ab+diasPrazo(ac&&ac.quando)*DIA;
          if(pz<Date.parse(hoje+"T00:00:00-03:00")) nc.push({obraId:s.obraId||null,origem:p[1],nome:s.serviceName||(s.info&&s.info.processo)||p[1]}); }); }); });
      porObra(nc,function(ob,L){ A.push({tipo:"nc",chave:"nc|"+ob+"|"+hoje,obraId:ob,titulo:"⚠️ "+L.length+" NC"+(L.length>1?"s":"")+" com prazo vencido",corpo:nomeObra(D,ob)+": "+L.slice(0,3).map(function(x){ return x.nome; }).join(", ")+(L.length>3?"…":""),url:"app.html#acoes"}); }); }
    // 2. DDS do dia
    if(util&&b.h>=9){ obras.forEach(function(o){ var tem=(D.dds||[]).some(function(d){ return vivo(D,d)&&(d.obraId||null)===o.id&&d.data===hoje; });
      if(!tem) A.push({tipo:"dds",chave:"dds|"+o.id+"|"+hoje,obraId:o.id,titulo:"🎓 Ainda não tem DDS hoje",corpo:o.nome+": faça o DDS antes de começar a frente.",url:"app.html#dds"}); }); }
    // 3. Diário do dia
    if(util&&b.h>=17){ obras.forEach(function(o){ var tem=(D.diarios||[]).some(function(d){ return vivo(D,d)&&(d.obraId||null)===o.id&&d.data===hoje; });
      if(!tem) A.push({tipo:"diario",chave:"diario|"+o.id+"|"+hoje,obraId:o.id,titulo:"📒 Diário de obra de hoje pendente",corpo:o.nome+": registre o diário antes de encerrar o dia.",url:"app.html#diario"}); }); }
    // 4. Liberação aguardando
    var lib=(D.liberacoes||[]).filter(function(l){ return vivo(D,l)&&((l.rascunho&&agora-ms(l.atualizadoEm)>DIA)||l.situacao==="Não liberada"); });
    porObra(lib,function(ob,L){ A.push({tipo:"lib",chave:"lib|"+ob+"|"+hoje,obraId:ob,titulo:"🚧 "+L.length+" liberação(ões) de frente aguardando",corpo:nomeObra(D,ob)+": "+L.slice(0,3).map(function(l){ return l.frente||"frente"; }).join(", "),url:"app.html#lib"}); });
    // 5. Preenchimento esquecido
    var ra=(D.rascunhos||[]).filter(function(r){ var t=ms(r.atualizadoEm); return vivo(D,r)&&agora-t>DIA&&agora-t<7*DIA; });
    porObra(ra,function(ob,L){ A.push({tipo:"rasc",chave:"rasc|"+ob+"|"+hoje,obraId:ob,titulo:"📝 "+L.length+" preenchimento(s) sem concluir",corpo:nomeObra(D,ob)+": "+L.slice(0,3).map(function(r){ return r.titulo||r.tipo; }).join(", "),url:"app.html"}); });
    // 6. Material reprovado
    (D.materiais||[]).forEach(function(m){ if(!vivo(D,m)||m.inspecao!=="Reprovado") return; var t=ms(m.atualizadoEm)||ms(m.criadoEm); if(t&&agora-t>2*DIA) return;
      A.push({tipo:"mat",chave:"mat|"+m.id,obraId:m.obraId||null,titulo:"🚫 Material reprovado no recebimento",corpo:(m.material||"Material")+(m.lote?" · lote "+m.lote:"")+(m.fornecedor?" · "+m.fornecedor:"")+" ("+nomeObra(D,m.obraId)+")",url:"app.html#materiais"}); });
    // 7. Registro novo da equipe
    if(desde){ [["dds","DDS","tema","data"],["fvsSalvas","FVS","serviceName","savedAt"],["auditoriasSalvas","Auditoria",null,"savedAt"],["diarios","Diário de obra","data","savedAt"]].forEach(function(p){
      (D[p[0]]||[]).forEach(function(x){ if(!vivo(D,x)||x.rascunho) return; var t=ms(x.savedAt)||ms(x._cri&&x._cri.em)||ms(x.atualizadoEm); if(!t||t<=desde||t>agora+60e3) return; if(eu&&autorDe(x)===eu) return;
        A.push({tipo:"novo",chave:"novo|"+x.id,obraId:x.obraId||null,titulo:"✅ "+p[1]+" registrado",corpo:(p[2]&&x[p[2]]?String(x[p[2]]).slice(0,60)+" · ":"")+nomeObra(D,x.obraId)+(autorDe(x)?" · por "+autorDe(x):""),url:"app.html"}); }); }); }
    // 8. Documentos perto de vencer
    (D.docsCtl||[]).forEach(function(d){ if(!vivo(D,d)||!d.validade) return; var v=Date.parse(d.validade+"T00:00:00-03:00"), h0=Date.parse(hoje+"T00:00:00-03:00"), dias=Math.round((v-h0)/DIA);
      if(dias<0||dias>15) return; var faixa=dias===0?"0":(dias<=7?"7":"15");
      A.push({tipo:"venc",chave:"venc|"+d.id+"|"+d.validade+"|"+faixa,obraId:d.obraId||null,titulo:dias===0?"📄 Documento vence hoje":"📄 Documento vence em "+dias+" dia"+(dias>1?"s":""),corpo:(d.tipo?d.tipo+": ":"")+(d.nome||"documento")+(d.pessoa?" · "+d.pessoa:""),url:"app.html#docs"}); });
    return A;
  }
  function textoWhats(A,empresa){ if(!A.length) return "✅ *MGI PRO* · Sem pendências agora"+(empresa?" ("+empresa+")":"")+".";
    return "📋 *MGI PRO · Pendências"+(empresa?" · "+empresa:"")+"*\n\n"+A.map(function(a){ return "• *"+a.titulo.replace(/\*/g,"")+"*\n  "+a.corpo.replace(/\*/g,""); }).join("\n")+"\n\n_Abra o app para ver os detalhes: https://mgipro.app_"; }
  var API={TIPOS:TIPOS,calcular:calcular,textoWhats:textoWhats,brt:brt};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.MGI_ALERTAS=API;
})(typeof window!=="undefined"?window:globalThis);
