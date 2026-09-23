import json, io, os, collections

NEW = {
 "en": "Server record of agent runs and approvals",
 "de": "Serverprotokoll der Agentenl\u00e4ufe und Genehmigungen",
 "fr": "Journal serveur des ex\u00e9cutions et approbations d'agents",
 "es": "Registro del servidor de ejecuciones y aprobaciones de agentes",
 "pt": "Registro do servidor de execu\u00e7\u00f5es e aprova\u00e7\u00f5es de agentes",
 "ja": "\u30b5\u30fc\u30d0\u30fc\u4e0a\u306e\u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u3068\u627f\u8a8d\u306e\u8a18\u9332",
 "ko": "\uc11c\ubc84\uc5d0 \uae30\ub85d\ub41c \uc5d0\uc774\uc804\ud2b8 \uc2e4\ud589 \ubc0f \uc2b9\uc778",
 "zh": "\u670d\u52a1\u5668\u7aef\u7684\u4ee3\u7406\u8fd0\u884c\u4e0e\u5ba1\u6279\u8bb0\u5f55",
 "hi": "\u090f\u091c\u0947\u0902\u091f \u0930\u0928 \u0914\u0930 \u0938\u094d\u0935\u0940\u0915\u0943\u0924\u093f\u092f\u094b\u0902 \u0915\u093e \u0938\u0930\u094d\u0935\u0930 \u0930\u093f\u0915\u0949\u0930\u094d\u0921",
 "ar": "\u0633\u062c\u0644 \u062e\u0627\u062f\u0645 \u0644\u062a\u0634\u063a\u064a\u0644\u0627\u062a \u0627\u0644\u0648\u0643\u0644\u0627\u0621 \u0648\u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0627\u062a",
 "id": "Catatan server atas run dan persetujuan agen",
 "ru": "\u0421\u0435\u0440\u0432\u0435\u0440\u043d\u0430\u044f \u0437\u0430\u043f\u0438\u0441\u044c \u0437\u0430\u043f\u0443\u0441\u043a\u043e\u0432 \u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0439 \u0430\u0433\u0435\u043d\u0442\u043e\u0432",
 "tr": "Arac\u0131 \u00e7al\u0131\u015ft\u0131rmalar\u0131n\u0131n ve onaylar\u0131n\u0131n sunucu kayd\u0131",
}

for fname in sorted(os.listdir('src/i18n/locales')):
    if not fname.endswith('.json'):
        continue
    code = fname[:-5]
    path = os.path.join('src/i18n/locales', fname)
    with io.open(path, encoding='utf-8') as f:
        data = json.load(f, object_pairs_hook=collections.OrderedDict)
    agents = data.get('aiAgent', {}).get('agents')
    if agents is None or 'activitySub' not in agents:
        print('skip', code)
        continue
    agents['activitySub'] = NEW.get(code, NEW['en'])
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print('updated', code)
