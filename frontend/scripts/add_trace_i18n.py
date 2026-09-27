import json, io, os, collections

trace_en = {
    "toggle": "View run details for {{botName}}",
    "loadError": "Couldn't load the run trace",
    "retry": "Retry",
    "empty": "No steps recorded for this run",
    "approvalLine": "{{tool}} \u00b7 {{status}}",
    "status": {"pending": "Pending", "running": "Running", "succeeded": "Succeeded", "failed": "Failed", "skipped": "Skipped"},
    "step": {"modelCall": "Model call", "toolCall": "Tool call", "retrieval": "Memory recall", "guardrail": "Guardrail", "approval": "Approval", "retry": "Retry", "handoff": "Handoff"},
}
approval_status_en = {"pending": "Pending", "approved": "Approved", "rejected": "Rejected", "expired": "Expired", "superseded": "Superseded"}

T = {
 "de": {"toggle": "Laufdetails f\u00fcr {{botName}} anzeigen", "loadError": "Der Ablauf konnte nicht geladen werden", "retry": "Erneut versuchen", "empty": "F\u00fcr diesen Lauf wurden keine Schritte aufgezeichnet", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "Ausstehend", "running": "L\u00e4uft", "succeeded": "Erfolgreich", "failed": "Fehlgeschlagen", "skipped": "\u00dcbersprungen"},
        "step": {"modelCall": "Modellaufruf", "toolCall": "Werkzeugaufruf", "retrieval": "Ged\u00e4chtnisabfrage", "guardrail": "Schutzregel", "approval": "Genehmigung", "retry": "Wiederholung", "handoff": "\u00dcbergabe"},
        "appr": {"pending": "Ausstehend", "approved": "Genehmigt", "rejected": "Abgelehnt", "expired": "Abgelaufen", "superseded": "Ersetzt"}},
 "fr": {"toggle": "Voir les d\u00e9tails de l'ex\u00e9cution pour {{botName}}", "loadError": "Impossible de charger la trace", "retry": "R\u00e9essayer", "empty": "Aucune \u00e9tape enregistr\u00e9e pour cette ex\u00e9cution", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "En attente", "running": "En cours", "succeeded": "R\u00e9ussi", "failed": "\u00c9chou\u00e9", "skipped": "Ignor\u00e9"},
        "step": {"modelCall": "Appel du mod\u00e8le", "toolCall": "Appel d'outil", "retrieval": "Rappel de m\u00e9moire", "guardrail": "Garde-fou", "approval": "Approbation", "retry": "Nouvelle tentative", "handoff": "Transfert"},
        "appr": {"pending": "En attente", "approved": "Approuv\u00e9e", "rejected": "Rejet\u00e9e", "expired": "Expir\u00e9e", "superseded": "Remplac\u00e9e"}},
 "es": {"toggle": "Ver detalles de la ejecuci\u00f3n de {{botName}}", "loadError": "No se pudo cargar la traza", "retry": "Reintentar", "empty": "No hay pasos registrados para esta ejecuci\u00f3n", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "Pendiente", "running": "En curso", "succeeded": "Correcto", "failed": "Fallido", "skipped": "Omitido"},
        "step": {"modelCall": "Llamada al modelo", "toolCall": "Llamada de herramienta", "retrieval": "Recuperaci\u00f3n de memoria", "guardrail": "Protecci\u00f3n", "approval": "Aprobaci\u00f3n", "retry": "Reintento", "handoff": "Transferencia"},
        "appr": {"pending": "Pendiente", "approved": "Aprobada", "rejected": "Rechazada", "expired": "Caducada", "superseded": "Sustituida"}},
 "pt": {"toggle": "Ver detalhes da execu\u00e7\u00e3o de {{botName}}", "loadError": "N\u00e3o foi poss\u00edvel carregar o rastreamento", "retry": "Tentar novamente", "empty": "Nenhuma etapa registrada para esta execu\u00e7\u00e3o", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "Pendente", "running": "Em execu\u00e7\u00e3o", "succeeded": "Conclu\u00eddo", "failed": "Falhou", "skipped": "Ignorado"},
        "step": {"modelCall": "Chamada do modelo", "toolCall": "Chamada de ferramenta", "retrieval": "Recupera\u00e7\u00e3o de mem\u00f3ria", "guardrail": "Prote\u00e7\u00e3o", "approval": "Aprova\u00e7\u00e3o", "retry": "Nova tentativa", "handoff": "Transfer\u00eancia"},
        "appr": {"pending": "Pendente", "approved": "Aprovada", "rejected": "Rejeitada", "expired": "Expirada", "superseded": "Substitu\u00edda"}},
 "ja": {"toggle": "{{botName}} \u306e\u5b9f\u884c\u8a73\u7d30\u3092\u8868\u793a", "loadError": "\u30c8\u30ec\u30fc\u30b9\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f", "retry": "\u518d\u8a66\u884c", "empty": "\u3053\u306e\u5b9f\u884c\u306e\u30b9\u30c6\u30c3\u30d7\u306f\u8a18\u9332\u3055\u308c\u3066\u3044\u307e\u305b\u3093", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\u4fdd\u7559\u4e2d", "running": "\u5b9f\u884c\u4e2d", "succeeded": "\u6210\u529f", "failed": "\u5931\u6557", "skipped": "\u30b9\u30ad\u30c3\u30d7"},
        "step": {"modelCall": "\u30e2\u30c7\u30eb\u547c\u3073\u51fa\u3057", "toolCall": "\u30c4\u30fc\u30eb\u547c\u3073\u51fa\u3057", "retrieval": "\u30e1\u30e2\u30ea\u53c2\u7167", "guardrail": "\u30ac\u30fc\u30c9\u30ec\u30fc\u30eb", "approval": "\u627f\u8a8d", "retry": "\u518d\u8a66\u884c", "handoff": "\u5f15\u304d\u7d99\u304e"},
        "appr": {"pending": "\u4fdd\u7559\u4e2d", "approved": "\u627f\u8a8d\u6e08\u307f", "rejected": "\u5374\u4e0b", "expired": "\u671f\u9650\u5207\u308c", "superseded": "\u7f6e\u304d\u63db\u3048\u6e08\u307f"}},
 "ko": {"toggle": "{{botName}} \uc2e4\ud589 \uc0c1\uc138 \ubcf4\uae30", "loadError": "\uc2e4\ud589 \ucd94\uc801\uc744 \ubd88\ub7ec\uc624\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4", "retry": "\ub2e4\uc2dc \uc2dc\ub3c4", "empty": "\uc774 \uc2e4\ud589\uc5d0 \uae30\ub85d\ub41c \ub2e8\uacc4\uac00 \uc5c6\uc2b5\ub2c8\ub2e4", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\ub300\uae30 \uc911", "running": "\uc2e4\ud589 \uc911", "succeeded": "\uc131\uacf5", "failed": "\uc2e4\ud328", "skipped": "\uac74\ub108\ub700"},
        "step": {"modelCall": "\ubaa8\ub378 \ud638\ucd9c", "toolCall": "\ub3c4\uad6c \ud638\ucd9c", "retrieval": "\uba54\ubaa8\ub9ac \ud68c\uc218", "guardrail": "\uac00\ub4dc\ub808\uc77c", "approval": "\uc2b9\uc778", "retry": "\uc7ac\uc2dc\ub3c4", "handoff": "\uc778\uacc4"},
        "appr": {"pending": "\ub300\uae30 \uc911", "approved": "\uc2b9\uc778\ub428", "rejected": "\uac70\uc808\ub428", "expired": "\ub9cc\ub8cc\ub428", "superseded": "\ub300\uccb4\ub428"}},
 "zh": {"toggle": "\u67e5\u770b {{botName}} \u7684\u8fd0\u884c\u8be6\u60c5", "loadError": "\u65e0\u6cd5\u52a0\u8f7d\u8fd0\u884c\u8f68\u8ff9", "retry": "\u91cd\u8bd5", "empty": "\u6b64\u6b21\u8fd0\u884c\u6ca1\u6709\u8bb0\u5f55\u7684\u6b65\u9aa4", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\u5f85\u5904\u7406", "running": "\u8fd0\u884c\u4e2d", "succeeded": "\u6210\u529f", "failed": "\u5931\u8d25", "skipped": "\u5df2\u8df3\u8fc7"},
        "step": {"modelCall": "\u6a21\u578b\u8c03\u7528", "toolCall": "\u5de5\u5177\u8c03\u7528", "retrieval": "\u8bb0\u5fc6\u68c0\u7d22", "guardrail": "\u62a4\u680f", "approval": "\u5ba1\u6279", "retry": "\u91cd\u8bd5", "handoff": "\u79fb\u4ea4"},
        "appr": {"pending": "\u5f85\u5904\u7406", "approved": "\u5df2\u6279\u51c6", "rejected": "\u5df2\u62d2\u7edd", "expired": "\u5df2\u8fc7\u671f", "superseded": "\u5df2\u88ab\u53d6\u4ee3"}},
 "hi": {"toggle": "{{botName}} \u0915\u0947 \u0932\u093f\u090f \u0930\u0928 \u0935\u093f\u0935\u0930\u0923 \u0926\u0947\u0916\u0947\u0902", "loadError": "\u0930\u0928 \u091f\u094d\u0930\u0947\u0938 \u0932\u094b\u0921 \u0928\u0939\u0940\u0902 \u0939\u094b \u0938\u0915\u093e", "retry": "\u092a\u0941\u0928\u0903 \u092a\u094d\u0930\u092f\u093e\u0938", "empty": "\u0907\u0938 \u0930\u0928 \u0915\u0947 \u0932\u093f\u090f \u0915\u094b\u0908 \u091a\u0930\u0923 \u0926\u0930\u094d\u091c \u0928\u0939\u0940\u0902 \u0939\u0948", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\u0932\u0902\u092c\u093f\u0924", "running": "\u091a\u0932 \u0930\u0939\u093e \u0939\u0948", "succeeded": "\u0938\u092b\u0932", "failed": "\u0935\u093f\u092b\u0932", "skipped": "\u091b\u094b\u0921\u093c\u093e \u0917\u092f\u093e"},
        "step": {"modelCall": "\u092e\u0949\u0921\u0932 \u0915\u0949\u0932", "toolCall": "\u091f\u0942\u0932 \u0915\u0949\u0932", "retrieval": "\u092e\u0947\u092e\u094b\u0930\u0940 \u0930\u093f\u0915\u0949\u0932", "guardrail": "\u0917\u093e\u0930\u094d\u0921\u0930\u0947\u0932", "approval": "\u0938\u094d\u0935\u0940\u0915\u0943\u0924\u093f", "retry": "\u092a\u0941\u0928\u0903 \u092a\u094d\u0930\u092f\u093e\u0938", "handoff": "\u0939\u0948\u0902\u0921\u0911\u092b\u093c"},
        "appr": {"pending": "\u0932\u0902\u092c\u093f\u0924", "approved": "\u0938\u094d\u0935\u0940\u0915\u0943\u0924", "rejected": "\u0905\u0938\u094d\u0935\u0940\u0915\u0943\u0924", "expired": "\u0938\u092e\u093e\u092a\u094d\u0924", "superseded": "\u092a\u094d\u0930\u0924\u093f\u0938\u094d\u0925\u093e\u092a\u093f\u0924"}},
 "ar": {"toggle": "\u0639\u0631\u0636 \u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u062a\u0634\u063a\u064a\u0644 \u0644\u0640 {{botName}}", "loadError": "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u062a\u062a\u0628\u0639 \u0627\u0644\u062a\u0634\u063a\u064a\u0644", "retry": "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629", "empty": "\u0644\u0627 \u062a\u0648\u062c\u062f \u062e\u0637\u0648\u0627\u062a \u0645\u0633\u062c\u0644\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u062a\u0634\u063a\u064a\u0644", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631", "running": "\u0642\u064a\u062f \u0627\u0644\u062a\u0646\u0641\u064a\u0630", "succeeded": "\u0646\u0627\u062c\u062d", "failed": "\u0641\u0627\u0634\u0644", "skipped": "\u062a\u0645 \u062a\u062e\u0637\u064a\u0647"},
        "step": {"modelCall": "\u0627\u0633\u062a\u062f\u0639\u0627\u0621 \u0627\u0644\u0646\u0645\u0648\u0630\u062c", "toolCall": "\u0627\u0633\u062a\u062f\u0639\u0627\u0621 \u0627\u0644\u0623\u062f\u0627\u0629", "retrieval": "\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0630\u0627\u0643\u0631\u0629", "guardrail": "\u062d\u0627\u062c\u0632 \u062d\u0645\u0627\u064a\u0629", "approval": "\u0645\u0648\u0627\u0641\u0642\u0629", "retry": "\u0625\u0639\u0627\u062f\u0629 \u0645\u062d\u0627\u0648\u0644\u0629", "handoff": "\u062a\u0633\u0644\u064a\u0645"},
        "appr": {"pending": "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631", "approved": "\u062a\u0645\u062a \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629", "rejected": "\u0645\u0631\u0641\u0648\u0636", "expired": "\u0645\u0646\u062a\u0647\u064a \u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0629", "superseded": "\u0645\u0633\u062a\u0628\u062f\u0644"}},
 "id": {"toggle": "Lihat detail run untuk {{botName}}", "loadError": "Tidak dapat memuat jejak run", "retry": "Coba lagi", "empty": "Tidak ada langkah tercatat untuk run ini", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "Menunggu", "running": "Berjalan", "succeeded": "Berhasil", "failed": "Gagal", "skipped": "Dilewati"},
        "step": {"modelCall": "Panggilan model", "toolCall": "Panggilan alat", "retrieval": "Pemanggilan memori", "guardrail": "Guardrail", "approval": "Persetujuan", "retry": "Coba ulang", "handoff": "Serah terima"},
        "appr": {"pending": "Menunggu", "approved": "Disetujui", "rejected": "Ditolak", "expired": "Kedaluwarsa", "superseded": "Digantikan"}},
 "ru": {"toggle": "\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0434\u0435\u0442\u0430\u043b\u0438 \u0437\u0430\u043f\u0443\u0441\u043a\u0430 \u0434\u043b\u044f {{botName}}", "loadError": "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0442\u0440\u0430\u0441\u0441\u0438\u0440\u043e\u0432\u043a\u0443", "retry": "\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c", "empty": "\u0414\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u0437\u0430\u043f\u0443\u0441\u043a\u0430 \u043d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u043d\u044b\u0445 \u0448\u0430\u0433\u043e\u0432", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435", "running": "\u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f", "succeeded": "\u0423\u0441\u043f\u0435\u0448\u043d\u043e", "failed": "\u041e\u0448\u0438\u0431\u043a\u0430", "skipped": "\u041f\u0440\u043e\u043f\u0443\u0449\u0435\u043d\u043e"},
        "step": {"modelCall": "\u0412\u044b\u0437\u043e\u0432 \u043c\u043e\u0434\u0435\u043b\u0438", "toolCall": "\u0412\u044b\u0437\u043e\u0432 \u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442\u0430", "retrieval": "\u041e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u0435 \u043a \u043f\u0430\u043c\u044f\u0442\u0438", "guardrail": "\u041e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0435", "approval": "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435", "retry": "\u041f\u043e\u0432\u0442\u043e\u0440", "handoff": "\u041f\u0435\u0440\u0435\u0434\u0430\u0447\u0430"},
        "appr": {"pending": "\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435", "approved": "\u041e\u0434\u043e\u0431\u0440\u0435\u043d\u043e", "rejected": "\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e", "expired": "\u0418\u0441\u0442\u0435\u043a\u043b\u043e", "superseded": "\u0417\u0430\u043c\u0435\u043d\u0435\u043d\u043e"}},
 "tr": {"toggle": "{{botName}} i\u00e7in \u00e7al\u0131\u015ft\u0131rma ayr\u0131nt\u0131lar\u0131n\u0131 g\u00f6r", "loadError": "\u00c7al\u0131\u015ft\u0131rma izi y\u00fcklenemedi", "retry": "Tekrar dene", "empty": "Bu \u00e7al\u0131\u015ft\u0131rma i\u00e7in kaydedilmi\u015f ad\u0131m yok", "approvalLine": "{{tool}} \u00b7 {{status}}",
        "status": {"pending": "Bekliyor", "running": "\u00c7al\u0131\u015f\u0131yor", "succeeded": "Ba\u015far\u0131l\u0131", "failed": "Ba\u015far\u0131s\u0131z", "skipped": "Atland\u0131"},
        "step": {"modelCall": "Model \u00e7a\u011fr\u0131s\u0131", "toolCall": "Ara\u00e7 \u00e7a\u011fr\u0131s\u0131", "retrieval": "Bellek \u00e7a\u011f\u0131rma", "guardrail": "Koruma", "approval": "Onay", "retry": "Yeniden deneme", "handoff": "Devir"},
        "appr": {"pending": "Bekliyor", "approved": "Onayland\u0131", "rejected": "Reddedildi", "expired": "S\u00fcresi doldu", "superseded": "Ge\u00e7ersiz k\u0131l\u0131nd\u0131"}},
}

for fname in sorted(os.listdir('src/i18n/locales')):
    if not fname.endswith('.json'):
        continue
    code = fname[:-5]
    path = os.path.join('src/i18n/locales', fname)
    with io.open(path, encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=collections.OrderedDict)
    ledger = data.get('agentLedger')
    if ledger is None:
        continue
    tr = T.get(code)
    ledger['trace'] = trace_en if tr is None else collections.OrderedDict([
        ('toggle', tr['toggle']), ('loadError', tr['loadError']), ('retry', tr['retry']),
        ('empty', tr['empty']), ('approvalLine', tr['approvalLine']),
        ('status', tr['status']), ('step', tr['step']),
    ])
    appr = ledger.setdefault('approvals', collections.OrderedDict())
    appr['status'] = approval_status_en if tr is None else tr['appr']
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('updated', code)
