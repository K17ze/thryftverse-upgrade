/**
 * sync-locales.mjs — generate web locale modules from the mobile source of truth.
 *
 * Source:  ../frontend/src/i18n/locales/*.json   (13 locales, en canonical)
 * Output:  ../src/lib/i18n/locales/<code>.ts
 *
 * What is ported per locale:
 *   - common      — the entire mobile `common` namespace (buttons, states,
 *                   navigation, actions, trust, misc). Real translations.
 *   - stateCopy   — canonical copy lives in en.json only; for non-en
 *                   locales just `stateCopy.actions` is authored below so
 *                   recovery buttons read natively while domain strings
 *                   fall back to en (mirrors mobile's actual coverage).
 *   - chrome      — web chrome labels (header/nav/footer/tab bar). Mobile
 *                   has no chrome namespace, so these are authored here in
 *                   the CHROME table. Brand names (Co-Own, Galleria, Pulse,
 *                   ThryftVerse) stay untranslated.
 *   - sync        — sync pill / retry banner labels (authored).
 *   - offline     — the global offline banner line (authored).
 *
 * Anything not present in a locale file falls back to en at lookup time —
 * see src/lib/i18n/locales.ts.
 *
 * Run: node scripts/sync-locales.mjs   (from web/)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, '..', 'frontend', 'src', 'i18n', 'locales');
const OUT = join(ROOT, 'src', 'lib', 'i18n', 'locales');

const CODES = ['en', 'ar', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

/* ── Authored web-chrome translations ──────────────────────────────────────
   Scoped, real translations for the labels the web chrome actually renders
   (Header, DepartmentNav, MobileTabBar, Footer). Kept deliberately small:
   the adoption path is to grow coverage per surface, not to fake it. */

const CHROME = {
  en: {
    tabs: { home: 'Home', explore: 'Explore', inbox: 'Inbox', profile: 'Profile', signIn: 'Sign in', createAria: 'Create — list a new item' },
    nav: { home: 'Home', explore: 'Explore', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Auctions', live: 'Live', galleria: 'Galleria' },
    groups: { categories: 'Categories', discover: 'Discover', invest: 'Invest', track: 'Track', bid: 'Bid', sell: 'Sell', liveShopping: 'Live shopping', editorial: 'Editorial' },
    links: {
      allCategories: 'All categories', collections: 'Collections', outfits: 'Outfits', searchByPhoto: 'Search by photo',
      browseEverything: 'Browse everything', browseAssets: 'Browse assets', yourPortfolio: 'Your portfolio',
      syndicates: 'Syndicates', startSyndicate: 'Start a syndicate', distributions: 'Distributions',
      priceAlerts: 'Price alerts', liveAuctions: 'Live auctions', myBids: 'My bids', startAuction: 'Start an auction',
      listAnItem: 'List an item', sellerHub: 'Seller hub', liveNow: 'Live now', goLive: 'Go live',
      latestIssue: 'Latest issue', orders: 'Orders', wallet: 'Wallet', aboutThryftverse: 'About ThryftVerse',
      inviteEarn: 'Invite & earn', sustainability: 'Sustainability', buyerProtection: 'Buyer protection',
      helpCentre: 'Help centre', supportCentre: 'Support centre', settings: 'Settings', privacy: 'Privacy',
      terms: 'Terms', about: 'About', help: 'Help', support: 'Support',
    },
    header: { searchPlaceholder: 'Search items, brands, members', notifications: 'Notifications', inbox: 'Inbox', bag: 'Bag', departments: 'Departments' },
    footer: {
      tagline: 'The marketplace for pre-loved fashion.', colShop: 'Shop', colSell: 'Sell', colAbout: 'About',
      colHelp: 'Help', legalAria: 'Legal and help', madeFor: 'Made for circular fashion', copyright: '© 2026 ThryftVerse',
    },
  },
  ar: {
    tabs: { home: 'الرئيسية', explore: 'استكشاف', inbox: 'البريد الوارد', profile: 'الملف الشخصي', signIn: 'تسجيل الدخول', createAria: 'إنشاء — أدرج عنصراً جديداً' },
    nav: { home: 'الرئيسية', explore: 'استكشاف', pulse: 'Pulse', coown: 'Co-Own', auctions: 'مزادات', live: 'مباشر', galleria: 'Galleria' },
    groups: { categories: 'الفئات', discover: 'اكتشاف', invest: 'استثمار', track: 'متابعة', bid: 'مزايدة', sell: 'بيع', liveShopping: 'تسوق مباشر', editorial: 'مقالات' },
    links: {
      allCategories: 'كل الفئات', collections: 'المجموعات', outfits: 'الإطلالات', searchByPhoto: 'البحث بالصورة',
      browseEverything: 'تصفح الكل', browseAssets: 'تصفح الأصول', yourPortfolio: 'محفظتك',
      syndicates: 'مجموعات الاستثمار', startSyndicate: 'إنشاء مجموعة استثمار', distributions: 'التوزيعات',
      priceAlerts: 'تنبيهات الأسعار', liveAuctions: 'مزادات مباشرة', myBids: 'مزايداتي', startAuction: 'بدء مزاد',
      listAnItem: 'أدرج عنصراً', sellerHub: 'مركز البائع', liveNow: 'مباشر الآن', goLive: 'ابدأ البث المباشر',
      latestIssue: 'أحدث إصدار', orders: 'الطلبات', wallet: 'المحفظة', aboutThryftverse: 'حول ThryftVerse',
      inviteEarn: 'ادعُ واكسب', sustainability: 'الاستدامة', buyerProtection: 'حماية المشتري',
      helpCentre: 'مركز المساعدة', supportCentre: 'مركز الدعم', settings: 'الإعدادات', privacy: 'الخصوصية',
      terms: 'الشروط', about: 'حول', help: 'المساعدة', support: 'الدعم',
    },
    header: { searchPlaceholder: 'ابحث عن عناصر وماركات وأعضاء', notifications: 'الإشعارات', inbox: 'البريد الوارد', bag: 'السلة', departments: 'الأقسام' },
    footer: {
      tagline: 'سوق الأزياء المستعملة.', colShop: 'تسوق', colSell: 'بيع', colAbout: 'حول',
      colHelp: 'المساعدة', legalAria: 'القانونية والمساعدة', madeFor: 'مصنوع من أجل الأزياء الدائرية', copyright: '© 2026 ThryftVerse',
    },
  },
  de: {
    tabs: { home: 'Start', explore: 'Entdecken', inbox: 'Posteingang', profile: 'Profil', signIn: 'Anmelden', createAria: 'Erstellen — neuen Artikel einstellen' },
    nav: { home: 'Start', explore: 'Entdecken', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Auktionen', live: 'Live', galleria: 'Galleria' },
    groups: { categories: 'Kategorien', discover: 'Entdecken', invest: 'Investieren', track: 'Verfolgen', bid: 'Bieten', sell: 'Verkaufen', liveShopping: 'Live-Shopping', editorial: 'Editorial' },
    links: {
      allCategories: 'Alle Kategorien', collections: 'Kollektionen', outfits: 'Outfits', searchByPhoto: 'Fotosuche',
      browseEverything: 'Alles durchsuchen', browseAssets: 'Assets durchsuchen', yourPortfolio: 'Dein Portfolio',
      syndicates: 'Syndikate', startSyndicate: 'Syndikat starten', distributions: 'Ausschüttungen',
      priceAlerts: 'Preisalarme', liveAuctions: 'Live-Auktionen', myBids: 'Meine Gebote', startAuction: 'Auktion starten',
      listAnItem: 'Artikel einstellen', sellerHub: 'Verkäuferbereich', liveNow: 'Jetzt live', goLive: 'Live gehen',
      latestIssue: 'Aktuelle Ausgabe', orders: 'Bestellungen', wallet: 'Wallet', aboutThryftverse: 'Über ThryftVerse',
      inviteEarn: 'Einladen & verdienen', sustainability: 'Nachhaltigkeit', buyerProtection: 'Käuferschutz',
      helpCentre: 'Hilfecenter', supportCentre: 'Support-Center', settings: 'Einstellungen', privacy: 'Datenschutz',
      terms: 'AGB', about: 'Über', help: 'Hilfe', support: 'Support',
    },
    header: { searchPlaceholder: 'Artikel, Marken, Mitglieder suchen', notifications: 'Benachrichtigungen', inbox: 'Posteingang', bag: 'Tasche', departments: 'Bereiche' },
    footer: {
      tagline: 'Der Marktplatz für gebrauchte Mode.', colShop: 'Kaufen', colSell: 'Verkaufen', colAbout: 'Über',
      colHelp: 'Hilfe', legalAria: 'Rechtliches und Hilfe', madeFor: 'Für Circular Fashion gemacht', copyright: '© 2026 ThryftVerse',
    },
  },
  es: {
    tabs: { home: 'Inicio', explore: 'Explorar', inbox: 'Bandeja de entrada', profile: 'Perfil', signIn: 'Iniciar sesión', createAria: 'Crear — publicar un artículo' },
    nav: { home: 'Inicio', explore: 'Explorar', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Subastas', live: 'En vivo', galleria: 'Galleria' },
    groups: { categories: 'Categorías', discover: 'Descubrir', invest: 'Invertir', track: 'Seguimiento', bid: 'Pujar', sell: 'Vender', liveShopping: 'Compras en vivo', editorial: 'Editorial' },
    links: {
      allCategories: 'Todas las categorías', collections: 'Colecciones', outfits: 'Outfits', searchByPhoto: 'Buscar por foto',
      browseEverything: 'Ver todo', browseAssets: 'Explorar activos', yourPortfolio: 'Tu portafolio',
      syndicates: 'Sindicatos', startSyndicate: 'Crear un sindicato', distributions: 'Distribuciones',
      priceAlerts: 'Alertas de precio', liveAuctions: 'Subastas en vivo', myBids: 'Mis pujas', startAuction: 'Crear una subasta',
      listAnItem: 'Publicar un artículo', sellerHub: 'Centro de vendedor', liveNow: 'En vivo ahora', goLive: 'Emitir en vivo',
      latestIssue: 'Último número', orders: 'Pedidos', wallet: 'Cartera', aboutThryftverse: 'Acerca de ThryftVerse',
      inviteEarn: 'Invita y gana', sustainability: 'Sostenibilidad', buyerProtection: 'Protección del comprador',
      helpCentre: 'Centro de ayuda', supportCentre: 'Centro de soporte', settings: 'Configuración', privacy: 'Privacidad',
      terms: 'Términos', about: 'Acerca de', help: 'Ayuda', support: 'Soporte',
    },
    header: { searchPlaceholder: 'Buscar artículos, marcas, miembros', notifications: 'Notificaciones', inbox: 'Bandeja de entrada', bag: 'Bolsa', departments: 'Departamentos' },
    footer: {
      tagline: 'El marketplace de moda de segunda mano.', colShop: 'Comprar', colSell: 'Vender', colAbout: 'Acerca de',
      colHelp: 'Ayuda', legalAria: 'Legal y ayuda', madeFor: 'Hecho para la moda circular', copyright: '© 2026 ThryftVerse',
    },
  },
  fr: {
    tabs: { home: 'Accueil', explore: 'Explorer', inbox: 'Boîte de réception', profile: 'Profil', signIn: 'Se connecter', createAria: 'Créer — mettre un article en vente' },
    nav: { home: 'Accueil', explore: 'Explorer', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Enchères', live: 'En direct', galleria: 'Galleria' },
    groups: { categories: 'Catégories', discover: 'Découvrir', invest: 'Investir', track: 'Suivi', bid: 'Enchérir', sell: 'Vendre', liveShopping: 'Shopping en direct', editorial: 'Éditorial' },
    links: {
      allCategories: 'Toutes les catégories', collections: 'Collections', outfits: 'Tenues', searchByPhoto: 'Recherche par photo',
      browseEverything: 'Tout parcourir', browseAssets: 'Parcourir les actifs', yourPortfolio: 'Votre portefeuille',
      syndicates: 'Syndicats', startSyndicate: 'Créer un syndicat', distributions: 'Distributions',
      priceAlerts: 'Alertes prix', liveAuctions: 'Enchères en direct', myBids: 'Mes enchères', startAuction: 'Lancer une enchère',
      listAnItem: 'Mettre un article en vente', sellerHub: 'Espace vendeur', liveNow: 'En direct maintenant', goLive: 'Passer en direct',
      latestIssue: 'Dernier numéro', orders: 'Commandes', wallet: 'Portefeuille', aboutThryftverse: 'À propos de ThryftVerse',
      inviteEarn: 'Inviter et gagner', sustainability: 'Durabilité', buyerProtection: 'Protection des acheteurs',
      helpCentre: "Centre d'aide", supportCentre: "Centre d'assistance", settings: 'Paramètres', privacy: 'Confidentialité',
      terms: 'Conditions', about: 'À propos', help: 'Aide', support: 'Assistance',
    },
    header: { searchPlaceholder: 'Rechercher articles, marques, membres', notifications: 'Notifications', inbox: 'Boîte de réception', bag: 'Panier', departments: 'Univers' },
    footer: {
      tagline: 'La marketplace de la mode seconde main.', colShop: 'Acheter', colSell: 'Vendre', colAbout: 'À propos',
      colHelp: 'Aide', legalAria: 'Mentions légales et aide', madeFor: 'Conçu pour la mode circulaire', copyright: '© 2026 ThryftVerse',
    },
  },
  hi: {
    tabs: { home: 'होम', explore: 'एक्सप्लोर करें', inbox: 'इनबॉक्स', profile: 'प्रोफ़ाइल', signIn: 'साइन इन करें', createAria: 'बनाएं — नया आइटम सूचीबद्ध करें' },
    nav: { home: 'होम', explore: 'एक्सप्लोर करें', pulse: 'Pulse', coown: 'Co-Own', auctions: 'नीलामी', live: 'लाइव', galleria: 'Galleria' },
    groups: { categories: 'श्रेणियाँ', discover: 'खोजें', invest: 'निवेश', track: 'ट्रैक करें', bid: 'बोली लगाएं', sell: 'बेचें', liveShopping: 'लाइव शॉपिंग', editorial: 'संपादकीय' },
    links: {
      allCategories: 'सभी श्रेणियाँ', collections: 'कलेक्शन', outfits: 'आउटफ़िट', searchByPhoto: 'फ़ोटो से खोजें',
      browseEverything: 'सब कुछ ब्राउज़ करें', browseAssets: 'एसेट ब्राउज़ करें', yourPortfolio: 'आपका पोर्टफ़ोलियो',
      syndicates: 'सिंडिकेट', startSyndicate: 'सिंडिकेट शुरू करें', distributions: 'वितरण',
      priceAlerts: 'मूल्य अलर्ट', liveAuctions: 'लाइव नीलामियां', myBids: 'मेरी बोलियाँ', startAuction: 'नीलामी शुरू करें',
      listAnItem: 'आइटम सूचीबद्ध करें', sellerHub: 'विक्रेता हब', liveNow: 'अभी लाइव', goLive: 'लाइव जाएं',
      latestIssue: 'नया अंक', orders: 'ऑर्डर', wallet: 'वॉलेट', aboutThryftverse: 'ThryftVerse के बारे में',
      inviteEarn: 'आमंत्रित करें और कमाएं', sustainability: 'स्थिरता', buyerProtection: 'खरीदार सुरक्षा',
      helpCentre: 'सहायता केंद्र', supportCentre: 'समर्थन केंद्र', settings: 'सेटिंग्स', privacy: 'गोपनीयता',
      terms: 'शर्तें', about: 'के बारे में', help: 'सहायता', support: 'समर्थन',
    },
    header: { searchPlaceholder: 'आइटम, ब्रांड, सदस्य खोजें', notifications: 'सूचनाएं', inbox: 'इनबॉक्स', bag: 'बैग', departments: 'विभाग' },
    footer: {
      tagline: 'प्री-लव्ड फ़ैशन का मार्केटप्लेस।', colShop: 'खरीदें', colSell: 'बेचें', colAbout: 'के बारे में',
      colHelp: 'सहायता', legalAria: 'कानूनी और सहायता', madeFor: 'सर्कुलर फ़ैशन के लिए बनाया गया', copyright: '© 2026 ThryftVerse',
    },
  },
  id: {
    tabs: { home: 'Beranda', explore: 'Jelajahi', inbox: 'Kotak masuk', profile: 'Profil', signIn: 'Masuk', createAria: 'Buat — pasang item baru' },
    nav: { home: 'Beranda', explore: 'Jelajahi', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Lelang', live: 'Live', galleria: 'Galleria' },
    groups: { categories: 'Kategori', discover: 'Temukan', invest: 'Investasi', track: 'Lacak', bid: 'Tawar', sell: 'Jual', liveShopping: 'Belanja live', editorial: 'Editorial' },
    links: {
      allCategories: 'Semua kategori', collections: 'Koleksi', outfits: 'Outfit', searchByPhoto: 'Cari dengan foto',
      browseEverything: 'Jelajahi semua', browseAssets: 'Jelajahi aset', yourPortfolio: 'Portofolio Anda',
      syndicates: 'Sindikat', startSyndicate: 'Mulai sindikat', distributions: 'Distribusi',
      priceAlerts: 'Notifikasi harga', liveAuctions: 'Lelang live', myBids: 'Tawaran saya', startAuction: 'Mulai lelang',
      listAnItem: 'Pasang item', sellerHub: 'Pusat penjual', liveNow: 'Live sekarang', goLive: 'Mulai live',
      latestIssue: 'Edisi terbaru', orders: 'Pesanan', wallet: 'Dompet', aboutThryftverse: 'Tentang ThryftVerse',
      inviteEarn: 'Undang & dapatkan', sustainability: 'Keberlanjutan', buyerProtection: 'Perlindungan pembeli',
      helpCentre: 'Pusat bantuan', supportCentre: 'Pusat dukungan', settings: 'Pengaturan', privacy: 'Privasi',
      terms: 'Ketentuan', about: 'Tentang', help: 'Bantuan', support: 'Dukungan',
    },
    header: { searchPlaceholder: 'Cari item, merek, anggota', notifications: 'Notifikasi', inbox: 'Kotak masuk', bag: 'Tas', departments: 'Departemen' },
    footer: {
      tagline: 'Marketplace untuk fashion preloved.', colShop: 'Belanja', colSell: 'Jual', colAbout: 'Tentang',
      colHelp: 'Bantuan', legalAria: 'Legal dan bantuan', madeFor: 'Dibuat untuk fashion sirkular', copyright: '© 2026 ThryftVerse',
    },
  },
  ja: {
    tabs: { home: 'ホーム', explore: '見つける', inbox: '受信トレイ', profile: 'プロフィール', signIn: 'ログイン', createAria: '作成 — 新しい商品を出品' },
    nav: { home: 'ホーム', explore: '見つける', pulse: 'Pulse', coown: 'Co-Own', auctions: 'オークション', live: 'ライブ', galleria: 'Galleria' },
    groups: { categories: 'カテゴリー', discover: '発見', invest: '投資', track: '追跡', bid: '入札', sell: '出品', liveShopping: 'ライブショッピング', editorial: 'エディトリアル' },
    links: {
      allCategories: 'すべてのカテゴリー', collections: 'コレクション', outfits: 'コーデ', searchByPhoto: '写真で検索',
      browseEverything: 'すべて見る', browseAssets: 'アセットを見る', yourPortfolio: 'ポートフォリオ',
      syndicates: 'シンジケート', startSyndicate: 'シンジケートを作成', distributions: '分配',
      priceAlerts: '価格アラート', liveAuctions: 'ライブオークション', myBids: '入札済み', startAuction: 'オークションを開始',
      listAnItem: '商品を出品', sellerHub: 'セラーハブ', liveNow: 'ライブ配信中', goLive: 'ライブを開始',
      latestIssue: '最新号', orders: '注文', wallet: 'ウォレット', aboutThryftverse: 'ThryftVerseについて',
      inviteEarn: '招待して獲得', sustainability: 'サステナビリティ', buyerProtection: '購入者保護',
      helpCentre: 'ヘルプセンター', supportCentre: 'サポートセンター', settings: '設定', privacy: 'プライバシー',
      terms: '利用規約', about: '概要', help: 'ヘルプ', support: 'サポート',
    },
    header: { searchPlaceholder: '商品、ブランド、メンバーを検索', notifications: '通知', inbox: '受信トレイ', bag: 'バッグ', departments: 'ジャンル' },
    footer: {
      tagline: '愛用ファッションのマーケットプレイス。', colShop: 'ショップ', colSell: '出品', colAbout: '概要',
      colHelp: 'ヘルプ', legalAria: '法務およびヘルプ', madeFor: 'サーキュラーファッションのために', copyright: '© 2026 ThryftVerse',
    },
  },
  ko: {
    tabs: { home: '홈', explore: '둘러보기', inbox: '받은편지함', profile: '프로필', signIn: '로그인', createAria: '만들기 — 새 상품 등록' },
    nav: { home: '홈', explore: '둘러보기', pulse: 'Pulse', coown: 'Co-Own', auctions: '경매', live: '라이브', galleria: 'Galleria' },
    groups: { categories: '카테고리', discover: '발견', invest: '투자', track: '추적', bid: '입찰', sell: '판매', liveShopping: '라이브 쇼핑', editorial: '에디토리얼' },
    links: {
      allCategories: '모든 카테고리', collections: '컬렉션', outfits: '코디', searchByPhoto: '사진으로 검색',
      browseEverything: '전체 둘러보기', browseAssets: '자산 둘러보기', yourPortfolio: '내 포트폴리오',
      syndicates: '신디케이트', startSyndicate: '신디케이트 시작', distributions: '배당',
      priceAlerts: '가격 알림', liveAuctions: '라이브 경매', myBids: '내 입찰', startAuction: '경매 시작',
      listAnItem: '상품 등록', sellerHub: '셀러 허브', liveNow: '지금 라이브', goLive: '라이브 시작',
      latestIssue: '최신호', orders: '주문', wallet: '지갑', aboutThryftverse: 'ThryftVerse 정보',
      inviteEarn: '초대하고 적립', sustainability: '지속 가능성', buyerProtection: '구매자 보호',
      helpCentre: '도움말 센터', supportCentre: '지원 센터', settings: '설정', privacy: '개인정보',
      terms: '이용약관', about: '정보', help: '도움말', support: '지원',
    },
    header: { searchPlaceholder: '상품, 브랜드, 멤버 검색', notifications: '알림', inbox: '받은편지함', bag: '백', departments: '카테고리' },
    footer: {
      tagline: '중고 패션 마켓플레이스.', colShop: '쇼핑', colSell: '판매', colAbout: '정보',
      colHelp: '도움말', legalAria: '법적 고지 및 도움말', madeFor: '순환 패션을 위해 제작', copyright: '© 2026 ThryftVerse',
    },
  },
  pt: {
    tabs: { home: 'Início', explore: 'Explorar', inbox: 'Caixa de entrada', profile: 'Perfil', signIn: 'Iniciar sessão', createAria: 'Criar — anunciar um artigo' },
    nav: { home: 'Início', explore: 'Explorar', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Leilões', live: 'Ao vivo', galleria: 'Galleria' },
    groups: { categories: 'Categorias', discover: 'Descobrir', invest: 'Investir', track: 'Acompanhar', bid: 'Licitar', sell: 'Vender', liveShopping: 'Compras ao vivo', editorial: 'Editorial' },
    links: {
      allCategories: 'Todas as categorias', collections: 'Coleções', outfits: 'Outfits', searchByPhoto: 'Pesquisar por foto',
      browseEverything: 'Ver tudo', browseAssets: 'Explorar ativos', yourPortfolio: 'Seu portfólio',
      syndicates: 'Sindicatos', startSyndicate: 'Criar um sindicato', distributions: 'Distribuições',
      priceAlerts: 'Alertas de preço', liveAuctions: 'Leilões ao vivo', myBids: 'Meus lances', startAuction: 'Criar um leilão',
      listAnItem: 'Anunciar um artigo', sellerHub: 'Central do vendedor', liveNow: 'Ao vivo agora', goLive: 'Entrar ao vivo',
      latestIssue: 'Última edição', orders: 'Pedidos', wallet: 'Carteira', aboutThryftverse: 'Sobre a ThryftVerse',
      inviteEarn: 'Convide e ganhe', sustainability: 'Sustentabilidade', buyerProtection: 'Proteção do comprador',
      helpCentre: 'Central de ajuda', supportCentre: 'Central de suporte', settings: 'Configurações', privacy: 'Privacidade',
      terms: 'Termos', about: 'Sobre', help: 'Ajuda', support: 'Suporte',
    },
    header: { searchPlaceholder: 'Pesquisar artigos, marcas, membros', notifications: 'Notificações', inbox: 'Caixa de entrada', bag: 'Sacola', departments: 'Departamentos' },
    footer: {
      tagline: 'O marketplace de moda em segunda mão.', colShop: 'Comprar', colSell: 'Vender', colAbout: 'Sobre',
      colHelp: 'Ajuda', legalAria: 'Informações legais e ajuda', madeFor: 'Feito para a moda circular', copyright: '© 2026 ThryftVerse',
    },
  },
  ru: {
    tabs: { home: 'Главная', explore: 'Обзор', inbox: 'Входящие', profile: 'Профиль', signIn: 'Войти', createAria: 'Создать — добавить товар' },
    nav: { home: 'Главная', explore: 'Обзор', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Аукционы', live: 'Эфир', galleria: 'Galleria' },
    groups: { categories: 'Категории', discover: 'Обзор', invest: 'Инвестиции', track: 'Отслеживание', bid: 'Ставки', sell: 'Продать', liveShopping: 'Лайв-шопинг', editorial: 'Журнал' },
    links: {
      allCategories: 'Все категории', collections: 'Коллекции', outfits: 'Образы', searchByPhoto: 'Поиск по фото',
      browseEverything: 'Смотреть всё', browseAssets: 'Смотреть активы', yourPortfolio: 'Ваш портфель',
      syndicates: 'Синдикаты', startSyndicate: 'Создать синдикат', distributions: 'Выплаты',
      priceAlerts: 'Уведомления о цене', liveAuctions: 'Аукционы в эфире', myBids: 'Мои ставки', startAuction: 'Создать аукцион',
      listAnItem: 'Добавить товар', sellerHub: 'Кабинет продавца', liveNow: 'Сейчас в эфире', goLive: 'Начать эфир',
      latestIssue: 'Последний выпуск', orders: 'Заказы', wallet: 'Кошелёк', aboutThryftverse: 'О ThryftVerse',
      inviteEarn: 'Приглашай и зарабатывай', sustainability: 'Устойчивость', buyerProtection: 'Защита покупателя',
      helpCentre: 'Справочный центр', supportCentre: 'Центр поддержки', settings: 'Настройки', privacy: 'Конфиденциальность',
      terms: 'Условия', about: 'О нас', help: 'Помощь', support: 'Поддержка',
    },
    header: { searchPlaceholder: 'Искать товары, бренды, участников', notifications: 'Уведомления', inbox: 'Входящие', bag: 'Сумка', departments: 'Разделы' },
    footer: {
      tagline: 'Маркетплейс секонд-хенд одежды.', colShop: 'Покупки', colSell: 'Продать', colAbout: 'О нас',
      colHelp: 'Помощь', legalAria: 'Правовая информация и помощь', madeFor: 'Создано для циркулярной моды', copyright: '© 2026 ThryftVerse',
    },
  },
  tr: {
    tabs: { home: 'Ana sayfa', explore: 'Keşfet', inbox: 'Gelen kutusu', profile: 'Profil', signIn: 'Giriş yap', createAria: 'Oluştur — yeni ürün listele' },
    nav: { home: 'Ana sayfa', explore: 'Keşfet', pulse: 'Pulse', coown: 'Co-Own', auctions: 'Mezatlar', live: 'Canlı', galleria: 'Galleria' },
    groups: { categories: 'Kategoriler', discover: 'Keşfet', invest: 'Yatırım', track: 'Takip', bid: 'Teklif ver', sell: 'Sat', liveShopping: 'Canlı alışveriş', editorial: 'Editoryal' },
    links: {
      allCategories: 'Tüm kategoriler', collections: 'Koleksiyonlar', outfits: 'Kombinler', searchByPhoto: 'Fotoğrafla ara',
      browseEverything: 'Hepsine göz at', browseAssets: 'Varlıklara göz at', yourPortfolio: 'Portföyünüz',
      syndicates: 'Yatırım grupları', startSyndicate: 'Yatırım grubu kur', distributions: 'Dağıtımlar',
      priceAlerts: 'Fiyat uyarıları', liveAuctions: 'Canlı mezatlar', myBids: 'Tekliflerim', startAuction: 'Mezat başlat',
      listAnItem: 'Ürün listele', sellerHub: 'Satıcı merkezi', liveNow: 'Şu an canlı', goLive: 'Canlı yayına geç',
      latestIssue: 'Son sayı', orders: 'Siparişler', wallet: 'Cüzdan', aboutThryftverse: 'ThryftVerse hakkında',
      inviteEarn: 'Davet et, kazan', sustainability: 'Sürdürülebilirlik', buyerProtection: 'Alıcı koruması',
      helpCentre: 'Yardım merkezi', supportCentre: 'Destek merkezi', settings: 'Ayarlar', privacy: 'Gizlilik',
      terms: 'Şartlar', about: 'Hakkında', help: 'Yardım', support: 'Destek',
    },
    header: { searchPlaceholder: 'Ürün, marka, üye ara', notifications: 'Bildirimler', inbox: 'Gelen kutusu', bag: 'Çanta', departments: 'Reyonlar' },
    footer: {
      tagline: 'İkinci el moda pazarı.', colShop: 'Alışveriş', colSell: 'Sat', colAbout: 'Hakkında',
      colHelp: 'Yardım', legalAria: 'Yasal ve yardım', madeFor: 'Döngüsel moda için yapıldı', copyright: '© 2026 ThryftVerse',
    },
  },
  zh: {
    tabs: { home: '首页', explore: '探索', inbox: '收件箱', profile: '个人资料', signIn: '登录', createAria: '创建 — 发布新商品' },
    nav: { home: '首页', explore: '探索', pulse: 'Pulse', coown: 'Co-Own', auctions: '拍卖', live: '直播', galleria: 'Galleria' },
    groups: { categories: '分类', discover: '发现', invest: '投资', track: '追踪', bid: '出价', sell: '出售', liveShopping: '直播购物', editorial: '专题' },
    links: {
      allCategories: '所有分类', collections: '合集', outfits: '穿搭', searchByPhoto: '拍照搜索',
      browseEverything: '浏览全部', browseAssets: '浏览资产', yourPortfolio: '您的投资组合',
      syndicates: '联合投资团', startSyndicate: '发起联合投资', distributions: '分配',
      priceAlerts: '价格提醒', liveAuctions: '实时拍卖', myBids: '我的出价', startAuction: '发起拍卖',
      listAnItem: '发布商品', sellerHub: '卖家中心', liveNow: '正在直播', goLive: '开始直播',
      latestIssue: '最新一期', orders: '订单', wallet: '钱包', aboutThryftverse: '关于 ThryftVerse',
      inviteEarn: '邀请并赚取', sustainability: '可持续性', buyerProtection: '买家保障',
      helpCentre: '帮助中心', supportCentre: '支持中心', settings: '设置', privacy: '隐私',
      terms: '条款', about: '关于', help: '帮助', support: '支持',
    },
    header: { searchPlaceholder: '搜索商品、品牌、用户', notifications: '通知', inbox: '收件箱', bag: '购物袋', departments: '分类' },
    footer: {
      tagline: '二手时尚交易平台。', colShop: '购物', colSell: '出售', colAbout: '关于',
      colHelp: '帮助', legalAria: '法律与帮助', madeFor: '为循环时尚而生', copyright: '© 2026 ThryftVerse',
    },
  },
};

/* ── CHROME additions — strings the live chrome renders that predate the
     table (account menu, search suggestions, Sell CTA, nav landmarks).
     Merged group-wise over CHROME at generation time. Add strings here as
     surfaces adopt t() — coverage grows per surface, never en-masse. */

const CHROME_EXTRA = {
  en: {
    header: { sellNow: 'Sell now' },
    links: { outfitBuilder: 'Outfit builder' },
    account: {
      yourAccount: 'Your account', menu: 'Account', viewProfile: 'View profile',
      saved: 'Saved', offers: 'Offers', aiAgents: 'AI agents', signOut: 'Sign out',
    },
    search: {
      suggestions: 'Search suggestions', matchingItems: 'Matching items', members: 'Members',
      recent: 'Recent searches', trending: 'Trending searches', popularBrands: 'Popular brands',
      removeRecent: 'Remove “{term}” from recent searches',
    },
    aria: { primaryNav: 'Primary', sections: '{label} sections' },
  },
  ar: {
    header: { sellNow: 'بيع الآن' },
    links: { outfitBuilder: 'منسّق الإطلالات' },
    account: {
      yourAccount: 'حسابك', menu: 'الحساب', viewProfile: 'عرض الملف الشخصي',
      saved: 'المحفوظات', offers: 'العروض', aiAgents: 'وكلاء الذكاء الاصطناعي', signOut: 'تسجيل الخروج',
    },
    search: {
      suggestions: 'اقتراحات البحث', matchingItems: 'عناصر مطابقة', members: 'الأعضاء',
      recent: 'عمليات البحث الأخيرة', trending: 'عمليات بحث رائجة', popularBrands: 'ماركات رائجة',
      removeRecent: 'إزالة "{term}" من عمليات البحث الأخيرة',
    },
    aria: { primaryNav: 'رئيسي', sections: 'أقسام {label}' },
  },
  de: {
    header: { sellNow: 'Jetzt verkaufen' },
    links: { outfitBuilder: 'Outfit-Builder' },
    account: {
      yourAccount: 'Dein Konto', menu: 'Konto', viewProfile: 'Profil ansehen',
      saved: 'Gespeichert', offers: 'Angebote', aiAgents: 'KI-Agenten', signOut: 'Abmelden',
    },
    search: {
      suggestions: 'Suchvorschläge', matchingItems: 'Passende Artikel', members: 'Mitglieder',
      recent: 'Letzte Suchen', trending: 'Trendsuchen', popularBrands: 'Beliebte Marken',
      removeRecent: '„{term}“ aus letzten Suchen entfernen',
    },
    aria: { primaryNav: 'Hauptnavigation', sections: '{label}-Bereiche' },
  },
  es: {
    header: { sellNow: 'Vender ahora' },
    links: { outfitBuilder: 'Creador de outfits' },
    account: {
      yourAccount: 'Tu cuenta', menu: 'Cuenta', viewProfile: 'Ver perfil',
      saved: 'Guardado', offers: 'Ofertas', aiAgents: 'Agentes de IA', signOut: 'Cerrar sesión',
    },
    search: {
      suggestions: 'Sugerencias de búsqueda', matchingItems: 'Artículos coincidentes', members: 'Miembros',
      recent: 'Búsquedas recientes', trending: 'Búsquedas en tendencia', popularBrands: 'Marcas populares',
      removeRecent: 'Eliminar "{term}" de las búsquedas recientes',
    },
    aria: { primaryNav: 'Principal', sections: 'Secciones de {label}' },
  },
  fr: {
    header: { sellNow: 'Vendre' },
    links: { outfitBuilder: 'Créateur de tenues' },
    account: {
      yourAccount: 'Votre compte', menu: 'Compte', viewProfile: 'Voir le profil',
      saved: 'Enregistrés', offers: 'Offres', aiAgents: 'Agents IA', signOut: 'Se déconnecter',
    },
    search: {
      suggestions: 'Suggestions de recherche', matchingItems: 'Articles correspondants', members: 'Membres',
      recent: 'Recherches récentes', trending: 'Recherches tendance', popularBrands: 'Marques populaires',
      removeRecent: 'Retirer « {term} » des recherches récentes',
    },
    aria: { primaryNav: 'Principal', sections: 'Sections {label}' },
  },
  hi: {
    header: { sellNow: 'अभी बेचें' },
    links: { outfitBuilder: 'आउटफ़िट बिल्डर' },
    account: {
      yourAccount: 'आपका खाता', menu: 'खाता', viewProfile: 'प्रोफ़ाइल देखें',
      saved: 'सहेजा गया', offers: 'ऑफ़र', aiAgents: 'AI एजेंट', signOut: 'साइन आउट',
    },
    search: {
      suggestions: 'खोज सुझाव', matchingItems: 'मेल खाते आइटम', members: 'सदस्य',
      recent: 'हाल की खोजें', trending: 'ट्रेंडिंग खोजें', popularBrands: 'लोकप्रिय ब्रांड',
      removeRecent: 'हाल की खोजों से "{term}" हटाएँ',
    },
    aria: { primaryNav: 'मुख्य', sections: '{label} अनुभाग' },
  },
  id: {
    header: { sellNow: 'Jual sekarang' },
    links: { outfitBuilder: 'Perancang outfit' },
    account: {
      yourAccount: 'Akun Anda', menu: 'Akun', viewProfile: 'Lihat profil',
      saved: 'Tersimpan', offers: 'Penawaran', aiAgents: 'Agen AI', signOut: 'Keluar',
    },
    search: {
      suggestions: 'Saran pencarian', matchingItems: 'Item yang cocok', members: 'Anggota',
      recent: 'Pencarian terakhir', trending: 'Pencarian populer', popularBrands: 'Merek populer',
      removeRecent: 'Hapus "{term}" dari pencarian terakhir',
    },
    aria: { primaryNav: 'Utama', sections: 'Bagian {label}' },
  },
  ja: {
    header: { sellNow: '今すぐ出品' },
    links: { outfitBuilder: 'コーデビルダー' },
    account: {
      yourAccount: 'アカウント', menu: 'アカウント', viewProfile: 'プロフィールを見る',
      saved: '保存済み', offers: 'オファー', aiAgents: 'AIエージェント', signOut: 'ログアウト',
    },
    search: {
      suggestions: '検索候補', matchingItems: '一致する商品', members: 'メンバー',
      recent: '最近の検索', trending: '急上昇の検索', popularBrands: '人気ブランド',
      removeRecent: '最近の検索から「{term}」を削除',
    },
    aria: { primaryNav: 'メイン', sections: '{label}のセクション' },
  },
  ko: {
    header: { sellNow: '지금 판매' },
    links: { outfitBuilder: '코디 빌더' },
    account: {
      yourAccount: '내 계정', menu: '계정', viewProfile: '프로필 보기',
      saved: '저장됨', offers: '오퍼', aiAgents: 'AI 에이전트', signOut: '로그아웃',
    },
    search: {
      suggestions: '검색 추천', matchingItems: '일치하는 상품', members: '멤버',
      recent: '최근 검색', trending: '인기 검색어', popularBrands: '인기 브랜드',
      removeRecent: '최근 검색에서 "{term}" 삭제',
    },
    aria: { primaryNav: '기본', sections: '{label} 섹션' },
  },
  pt: {
    header: { sellNow: 'Vender agora' },
    links: { outfitBuilder: 'Criador de looks' },
    account: {
      yourAccount: 'Sua conta', menu: 'Conta', viewProfile: 'Ver perfil',
      saved: 'Guardados', offers: 'Ofertas', aiAgents: 'Agentes de IA', signOut: 'Terminar sessão',
    },
    search: {
      suggestions: 'Sugestões de pesquisa', matchingItems: 'Artigos correspondentes', members: 'Membros',
      recent: 'Pesquisas recentes', trending: 'Pesquisas em alta', popularBrands: 'Marcas populares',
      removeRecent: 'Remover "{term}" das pesquisas recentes',
    },
    aria: { primaryNav: 'Principal', sections: 'Secções de {label}' },
  },
  ru: {
    header: { sellNow: 'Продать' },
    links: { outfitBuilder: 'Конструктор образов' },
    account: {
      yourAccount: 'Ваш аккаунт', menu: 'Аккаунт', viewProfile: 'Открыть профиль',
      saved: 'Сохранённое', offers: 'Предложения', aiAgents: 'ИИ-агенты', signOut: 'Выйти',
    },
    search: {
      suggestions: 'Поисковые подсказки', matchingItems: 'Подходящие товары', members: 'Участники',
      recent: 'Недавние запросы', trending: 'Популярные запросы', popularBrands: 'Популярные бренды',
      removeRecent: 'Удалить «{term}» из недавних запросов',
    },
    aria: { primaryNav: 'Основная', sections: 'Разделы: {label}' },
  },
  tr: {
    header: { sellNow: 'Şimdi sat' },
    links: { outfitBuilder: 'Kombin oluşturucu' },
    account: {
      yourAccount: 'Hesabınız', menu: 'Hesap', viewProfile: 'Profili gör',
      saved: 'Kaydedilenler', offers: 'Teklifler', aiAgents: 'YZ ajanları', signOut: 'Çıkış yap',
    },
    search: {
      suggestions: 'Arama önerileri', matchingItems: 'Eşleşen ürünler', members: 'Üyeler',
      recent: 'Son aramalar', trending: 'Trend aramalar', popularBrands: 'Popüler markalar',
      removeRecent: 'Son aramalardan "{term}" kaldır',
    },
    aria: { primaryNav: 'Birincil', sections: '{label} bölümleri' },
  },
  zh: {
    header: { sellNow: '立即出售' },
    links: { outfitBuilder: '穿搭工具' },
    account: {
      yourAccount: '您的账户', menu: '账户', viewProfile: '查看个人资料',
      saved: '已保存', offers: '出价', aiAgents: 'AI 智能体', signOut: '退出登录',
    },
    search: {
      suggestions: '搜索建议', matchingItems: '匹配商品', members: '用户',
      recent: '最近搜索', trending: '热门搜索', popularBrands: '热门品牌',
      removeRecent: '从最近搜索中移除"{term}"',
    },
    aria: { primaryNav: '主导航', sections: '{label}栏目' },
  },
};

/** Group-wise merge — extras extend (never replace) the base CHROME table. */
function mergeChrome(base, extra) {
  const out = { ...base };
  for (const [group, entries] of Object.entries(extra ?? {})) {
    out[group] = { ...(base?.[group] ?? {}), ...entries };
  }
  return out;
}

/* ── Web-authored stateCopy extension — domains the web renders that the
     mobile registry has no entry for. en only, matching mobile's domain
     coverage (non-en locales resolve through the en fallback); register the
     domain key in src/lib/state-copy/registry.ts when adding one. */

const STATE_COPY_WEB_EN = {
  notifications: {
    loading: 'Loading your notifications',
    empty: 'No notifications yet. Offers, orders and new followers will show up here.',
    emptyFiltered: 'No notifications match this filter. Try a different one.',
    error: "Couldn't load your notifications. Check your connection and try again.",
    errorRecovery: 'Check your connection and try again.',
    offline: "You're offline. Your notifications will catch up when you reconnect.",
    stale: 'Notifications may be out of date. Refresh to see the latest.',
  },
};

/* ── Authored sync / offline / stateCopy.actions strings ────────────────── */

const SYNC = {
  en: { live: 'Live', syncing: 'Syncing…', offline: 'Offline', cached: 'Cached', pendingCount: '{count} waiting to sync', retryFailed: 'Retry failed', discardFailed: 'Discard failed' },
  ar: { live: 'مباشر', syncing: 'جاري المزامنة…', offline: 'غير متصل', cached: 'مخزّن مؤقتًا', pendingCount: '{count} في انتظار المزامنة', retryFailed: 'إعادة المحاولات الفاشلة', discardFailed: 'تجاهل المحاولات الفاشلة' },
  de: { live: 'Live', syncing: 'Synchronisierung…', offline: 'Offline', cached: 'Zwischengespeichert', pendingCount: '{count} warten auf Synchronisierung', retryFailed: 'Fehlgeschlagene erneut versuchen', discardFailed: 'Fehlgeschlagene verwerfen' },
  es: { live: 'En vivo', syncing: 'Sincronizando…', offline: 'Sin conexión', cached: 'En caché', pendingCount: '{count} pendientes de sincronizar', retryFailed: 'Reintentar los fallidos', discardFailed: 'Descartar los fallidos' },
  fr: { live: 'En direct', syncing: 'Synchronisation…', offline: 'Hors ligne', cached: 'En cache', pendingCount: '{count} en attente de synchronisation', retryFailed: 'Réessayer les échecs', discardFailed: 'Ignorer les échecs' },
  hi: { live: 'लाइव', syncing: 'सिंक हो रहा है…', offline: 'ऑफ़लाइन', cached: 'कैश किया गया', pendingCount: '{count} सिंक की प्रतीक्षा में', retryFailed: 'विफल को पुनः प्रयास करें', discardFailed: 'विफल को छोड़ दें' },
  id: { live: 'Live', syncing: 'Menyinkronkan…', offline: 'Offline', cached: 'Tersimpan', pendingCount: '{count} menunggu sinkronisasi', retryFailed: 'Coba lagi yang gagal', discardFailed: 'Buang yang gagal' },
  ja: { live: 'ライブ', syncing: '同期中…', offline: 'オフライン', cached: 'キャッシュ済み', pendingCount: '{count} 件が同期待ち', retryFailed: '失敗した項目を再試行', discardFailed: '失敗した項目を破棄' },
  ko: { live: '라이브', syncing: '동기화 중…', offline: '오프라인', cached: '캐시됨', pendingCount: '{count}개 동기화 대기 중', retryFailed: '실패한 항목 다시 시도', discardFailed: '실패한 항목 삭제' },
  pt: { live: 'Ao vivo', syncing: 'Sincronizando…', offline: 'Offline', cached: 'Em cache', pendingCount: '{count} aguardando sincronização', retryFailed: 'Tentar novamente os que falharam', discardFailed: 'Descartar os que falharam' },
  ru: { live: 'Эфир', syncing: 'Синхронизация…', offline: 'Офлайн', cached: 'Из кэша', pendingCount: '{count} ожидают синхронизации', retryFailed: 'Повторить неудачные', discardFailed: 'Отменить неудачные' },
  tr: { live: 'Canlı', syncing: 'Senkronize ediliyor…', offline: 'Çevrimdışı', cached: 'Önbellekte', pendingCount: '{count} senkronizasyon bekliyor', retryFailed: 'Başarısızları yeniden dene', discardFailed: 'Başarısızları at' },
  zh: { live: '直播', syncing: '同步中…', offline: '离线', cached: '已缓存', pendingCount: '{count} 项等待同步', retryFailed: '重试失败项', discardFailed: '丢弃失败项' },
};

const OFFLINE = {
  en: { banner: 'You are offline. Showing cached content.' },
  ar: { banner: 'أنت غير متصل. يتم عرض المحتوى المخزّن.' },
  de: { banner: 'Du bist offline. Zwischengespeicherte Inhalte werden angezeigt.' },
  es: { banner: 'Estás sin conexión. Mostrando contenido en caché.' },
  fr: { banner: 'Vous êtes hors ligne. Contenu en cache affiché.' },
  hi: { banner: 'आप ऑफ़लाइन हैं। कैश की गई सामग्री दिखाई जा रही है।' },
  id: { banner: 'Anda sedang offline. Menampilkan konten tersimpan.' },
  ja: { banner: 'オフラインです。キャッシュ済みのコンテンツを表示しています。' },
  ko: { banner: '오프라인 상태입니다. 캐시된 콘텐츠를 표시합니다.' },
  pt: { banner: 'Você está offline. Mostrando conteúdo em cache.' },
  ru: { banner: 'Вы не в сети. Показан кэшированный контент.' },
  tr: { banner: 'Çevrimdışısınız. Önbelleğe alınmış içerik gösteriliyor.' },
  zh: { banner: '您当前处于离线状态。正在显示缓存内容。' },
};

const STATE_COPY_ACTIONS = {
  en: { tryAgain: 'Try again', refresh: 'Refresh', browseListings: 'Browse listings', addListing: 'Add a listing', clearFilters: 'Clear filters' },
  ar: { tryAgain: 'حاول مجدداً', refresh: 'تحديث', browseListings: 'تصفح العناصر', addListing: 'أضف عنصراً', clearFilters: 'مسح الفلاتر' },
  de: { tryAgain: 'Erneut versuchen', refresh: 'Aktualisieren', browseListings: 'Artikel durchsuchen', addListing: 'Artikel einstellen', clearFilters: 'Filter löschen' },
  es: { tryAgain: 'Inténtalo de nuevo', refresh: 'Actualizar', browseListings: 'Ver artículos', addListing: 'Añadir un artículo', clearFilters: 'Borrar filtros' },
  fr: { tryAgain: 'Réessayer', refresh: 'Actualiser', browseListings: 'Parcourir les articles', addListing: 'Ajouter un article', clearFilters: 'Effacer les filtres' },
  hi: { tryAgain: 'फिर से प्रयास करें', refresh: 'रीफ़्रेश करें', browseListings: 'आइटम ब्राउज़ करें', addListing: 'आइटम जोड़ें', clearFilters: 'फ़िल्टर साफ़ करें' },
  id: { tryAgain: 'Coba lagi', refresh: 'Segarkan', browseListings: 'Jelajahi item', addListing: 'Tambah item', clearFilters: 'Hapus filter' },
  ja: { tryAgain: 'もう一度試す', refresh: '更新', browseListings: '商品を見る', addListing: '商品を追加', clearFilters: 'フィルターをクリア' },
  ko: { tryAgain: '다시 시도', refresh: '새로고침', browseListings: '상품 둘러보기', addListing: '상품 추가', clearFilters: '필터 지우기' },
  pt: { tryAgain: 'Tentar novamente', refresh: 'Atualizar', browseListings: 'Ver artigos', addListing: 'Adicionar um artigo', clearFilters: 'Limpar filtros' },
  ru: { tryAgain: 'Повторить', refresh: 'Обновить', browseListings: 'Смотреть товары', addListing: 'Добавить товар', clearFilters: 'Сбросить фильтры' },
  tr: { tryAgain: 'Tekrar dene', refresh: 'Yenile', browseListings: 'Ürünlere göz at', addListing: 'Ürün ekle', clearFilters: 'Filtreleri temizle' },
  zh: { tryAgain: '重试', refresh: '刷新', browseListings: '浏览商品', addListing: '添加商品', clearFilters: '清除筛选' },
};

/* ── Generation ─────────────────────────────────────────────────────────── */

mkdirSync(OUT, { recursive: true });

const HEADER = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate: node scripts/sync-locales.mjs (from web/)
 * Source: frontend/src/i18n/locales/<code>.json (common, stateCopy)
 *         + authored chrome/sync/offline tables in the generator.
 */
`;

for (const code of CODES) {
  const raw = JSON.parse(readFileSync(join(SRC, `${code}.json`), 'utf-8'));
  const messages = {
    common: raw.common ?? {},
    chrome: mergeChrome(CHROME[code] ?? CHROME.en, CHROME_EXTRA[code] ?? CHROME_EXTRA.en),
    stateCopy:
      code === 'en'
        ? (raw.stateCopy ?? {})
        : { actions: STATE_COPY_ACTIONS[code] },
    sync: SYNC[code] ?? SYNC.en,
    offline: OFFLINE[code] ?? OFFLINE.en,
  };
  // en stateCopy.actions comes straight from the source file when present.
  if (code === 'en' && raw.stateCopy?.actions) {
    messages.stateCopy = { ...raw.stateCopy, actions: raw.stateCopy.actions };
  }
  // Web-authored domains (notifications, …) exist in en only — non-en
  // locales resolve them through the en fallback, like every domain entry.
  if (code === 'en') {
    messages.stateCopy = { ...messages.stateCopy, ...STATE_COPY_WEB_EN };
  }

  const body =
    code === 'en'
      ? `${HEADER}\nexport const en = ${JSON.stringify(messages, null, 2)};\n`
      : `${HEADER}\nimport type { DeepPartial, Messages } from '../locales';\n\nexport const ${code}: DeepPartial<Messages> = ${JSON.stringify(messages, null, 2)};\n`;

  writeFileSync(join(OUT, `${code}.ts`), body, 'utf-8');
  console.log(`wrote src/lib/i18n/locales/${code}.ts`);
}
