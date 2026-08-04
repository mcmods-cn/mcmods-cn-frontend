export type MinecraftLanguage = {
  minecraftCode: string;
  code: string;
  name: string;
  region: string;
  label: string;
  searchText: string;
};

// Minecraft 1.21.1 language metadata, read from Mojang's asset index 17.
const minecraftLanguageEntries = [
  ["af_za","Afrikaans","Suid-Afrika"],
  ["ar_sa","العربية","العالم العربي"],
  ["ast_es","Asturianu","Asturies"],
  ["az_az","Azərbaycanca","Azərbaycan"],
  ["ba_ru","Башҡортса","Башҡортостан, Рәсәй"],
  ["bar","Boarisch","Bayern"],
  ["be_by","Беларуская","Беларусь"],
  ["be_latn","Biełaruskaja","Biełaruś"],
  ["bg_bg","Български","България"],
  ["br_fr","Brezhoneg","Breizh"],
  ["brb","Braobans","Braobant"],
  ["bs_ba","Bosanski","Bosna i Hercegovina"],
  ["ca_es","Català","Catalunya"],
  ["cs_cz","Čeština","Česko"],
  ["cv_cu","Чӑвашла","Чӑваш Ен, Раҫҫей"],
  ["cy_gb","Cymraeg","Cymru"],
  ["da_dk","Dansk","Danmark"],
  ["de_at","Deitsch","Österreich"],
  ["de_ch","Schwiizerdütsch","Schwiiz"],
  ["de_de","Deutsch","Deutschland"],
  ["el_gr","Ελληνικά","Ελλάδα"],
  ["en_au","English","Australia"],
  ["en_ca","English","Canada"],
  ["en_gb","English","United Kingdom"],
  ["en_nz","English","New Zealand"],
  ["en_pt","Pirate Speak","The Seven Seas"],
  ["en_ud","ɥsᴉꞁᵷuƎ","uʍoᗡ ǝpᴉsd∩"],
  ["enp","Anglish","Oned Riches"],
  ["enws","Shakespearean English","Kingdom of England"],
  ["eo_uy","Esperanto","Esperantujo"],
  ["es_ar","Español","Argentina"],
  ["es_cl","Español","Chile"],
  ["es_ec","Español","Ecuador"],
  ["es_es","Español","España"],
  ["es_mx","Español","México"],
  ["es_uy","Español","Uruguay"],
  ["es_ve","Español","Venezuela"],
  ["esan","Andalûh","Andaluçía"],
  ["et_ee","Eesti keel","Eesti"],
  ["eu_es","Euskara","Euskal Herria"],
  ["fa_ir","فارسی","ايران"],
  ["fi_fi","Suomi","Suomi"],
  ["fil_ph","Filipino","Pilipinas"],
  ["fo_fo","Føroyskt","Føroyar"],
  ["fr_ca","Français","Canada"],
  ["fr_ch","Français","Suisse"],
  ["fr_fr","Français","France"],
  ["fra_de","Fränggisch","Franggn"],
  ["fur_it","Furlan","Friûl"],
  ["fy_nl","Frysk","Fryslân"],
  ["ga_ie","Gaeilge","Éire"],
  ["gd_gb","Gàidhlig","Alba"],
  ["gl_es","Galego","Galicia / Galiza"],
  ["go_fr","Galo","Bertègn"],
  ["got_de","𐌲𐌿𐍄𐍂𐌰𐌶𐌳𐌰","𐌸𐍉 𐌰𐌹𐌽𐌰𐌼𐌿𐌽𐌳𐍉𐌽𐌰 𐍂𐌴𐌹𐌺𐌾𐌰"],
  ["hal_ua","Галицка","Галичина, Вкраїна"],
  ["haw_us","ʻŌlelo Hawaiʻi","Hawaiʻi"],
  ["he_il","עברית","ישראל"],
  ["hi_in","हिंदी","भारत"],
  ["hn_no","Høgnorsk","Norig"],
  ["hr_hr","Hrvatski","Hrvatska"],
  ["hu_hu","Magyar","Magyarország"],
  ["hy_am","Հայերեն","Հայաստան"],
  ["id_id","Bahasa Indonesia","Indonesia"],
  ["ig_ng","Igbo","Naigeria"],
  ["io_en","Ido","Idia"],
  ["is_is","Íslenska","Ísland"],
  ["isv","Medžuslovjansky","Slovjanščina"],
  ["it_it","Italiano","Italia"],
  ["ja_jp","日本語","日本"],
  ["jbo_en","la .lojban.","la jbogu'e"],
  ["ka_ge","ქართული","საქართველო"],
  ["kk_kz","Қазақша","Қазақстан"],
  ["kn_in","ಕನ್ನಡ","ಭಾರತ"],
  ["ko_kr","한국어","대한민국"],
  ["ksh","Kölsch/Ripoarisch","Rhingland"],
  ["kw_gb","Kernewek","Kernow"],
  ["ky_kg","Кыргызча","Кыргызстан"],
  ["la_la","Latina","Latium"],
  ["lb_lu","Lëtzebuergesch","Lëtzebuerg"],
  ["li_li","Limburgs","Limburg"],
  ["lmo","Lombard","Lombardia"],
  ["lo_la","ລາວ","ປະເທດລາວ"],
  ["lol_us","LOLCAT","Kingdom of Cats"],
  ["lt_lt","Lietuvių","Lietuva"],
  ["lv_lv","Latviešu","Latvija"],
  ["lzh","文言","華夏"],
  ["mk_mk","Македонски","Северна Македонија"],
  ["mn_mn","Монгол","Монгол Улс"],
  ["ms_my","Bahasa Melayu","Malaysia"],
  ["mt_mt","Malti","Malta"],
  ["nah","Mēxikatlahtōlli","Mēxiko"],
  ["nds_de","Plattdüütsch","Düütschland"],
  ["nl_be","Vlaams","België"],
  ["nl_nl","Nederlands","Nederland"],
  ["nn_no","Norsk nynorsk","Noreg"],
  ["no_no","Norsk bokmål","Norge"],
  ["oc_fr","Occitan","Occitània"],
  ["ovd","Övdalska","Swerre"],
  ["pl_pl","Polski","Polska"],
  ["pls","Ngiiwà","Ndanìꞌngà"],
  ["pt_br","Português","Brasil"],
  ["pt_pt","Português","Portugal"],
  ["qcb_es","Cántabru/Montañés","Cantabria"],
  ["qid","Bhs. Indonesia edjaän lama","Indonesia tempo doeloe"],
  ["qya_aa","Quenya","Arda"],
  ["ro_ro","Română","România"],
  ["rpr","Русскій дореформенный","Россійская имперія"],
  ["ru_ru","Русский","Россия"],
  ["ry_ua","Руснацькый","Пудкарпатя, Украина"],
  ["sah_sah","Сахалыы","Cаха Сирэ"],
  ["se_no","Davvisámegiella","Sápmi"],
  ["sk_sk","Slovenčina","Slovensko"],
  ["sl_si","Slovenščina","Slovenija"],
  ["so_so","Soomaali","Soomaaliya"],
  ["sq_al","Shqip","Shqipëri"],
  ["sr_cs","Srpski","Srbija"],
  ["sr_sp","Српски","Србија"],
  ["sv_se","Svenska","Sverige"],
  ["sxu","Säggs’sch","Saggsn"],
  ["szl","Ślōnski","Gōrny Ślōnsk"],
  ["ta_in","தமிழ்","இந்தியா"],
  ["th_th","ไทย","ประเทศไทย"],
  ["tl_ph","Tagalog","Pilipinas"],
  ["tlh_aa","tlhIngan Hol","tlhIngan wo'"],
  ["tok","toki pona","kulupu pona"],
  ["tr_tr","Türkçe","Türkiye"],
  ["tt_ru","Татарча","Татарстан, Рәсәй"],
  ["tzo_mx","Bats'i k'op","Jobel"],
  ["uk_ua","Українська","Україна"],
  ["uz_uz","O'zbekcha","O'zbekiston"],
  ["val_es","Català (Valencià)","País Valencià"],
  ["vec_it","Vèneto","Veneto"],
  ["vi_vn","Tiếng Việt","Việt Nam"],
  ["vp_vl","Viossa","Vilant"],
  ["vro","Võro","Eesti"],
  ["yi_de","ייִדיש","אשכנזיש יידן"],
  ["yo_ng","Yorùbá","Nàìjíríà"],
  ["zh_cn","简体中文","中国大陆"],
  ["zh_hk","繁體中文","香港特別行政區"],
  ["zh_tw","繁體中文","台灣"],
  ["zlm_arab","بهاس ملايو","مليسيا"],
] as const;

function canonicalLanguageCode(minecraftCode: string) {
  return minecraftCode.split("_").map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (part.length === 2 || /^\d{3}$/.test(part)) return part.toUpperCase();
    if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    return part.toLowerCase();
  }).join("-");
}

export const minecraftLanguages: readonly MinecraftLanguage[] = minecraftLanguageEntries.map(
  ([minecraftCode, name, region]) => {
    const code = canonicalLanguageCode(minecraftCode);
    const label = region ? `${name} (${region})` : name;
    return {
      minecraftCode,
      code,
      name,
      region,
      label,
      searchText: `${minecraftCode} ${code} ${name} ${region}`.toLocaleLowerCase(),
    };
  },
);

const minecraftLanguageByKey = new Map<string, MinecraftLanguage>();
for (const language of minecraftLanguages) {
  minecraftLanguageByKey.set(language.minecraftCode.toLowerCase(), language);
  minecraftLanguageByKey.set(language.code.toLowerCase(), language);
}

export function findMinecraftLanguage(value: string | null | undefined) {
  const key = value?.trim().replaceAll("_", "-").toLowerCase() ?? "";
  return key ? minecraftLanguageByKey.get(key) : undefined;
}

export function normalizeMinecraftLanguageCode(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return "";
  return findMinecraftLanguage(candidate)?.code ?? candidate.replaceAll("_", "-");
}

export function minecraftLanguageLabel(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  if (!candidate) return "";
  return findMinecraftLanguage(candidate)?.label ?? candidate;
}

export function formatMinecraftLanguages(values: readonly string[], separator = " · ") {
  return values.map(minecraftLanguageLabel).filter(Boolean).join(separator);
}
