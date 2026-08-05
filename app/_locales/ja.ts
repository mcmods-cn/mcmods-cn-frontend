import en from "./en-US";
const ja = {
  ...en,
  common: { ...en.common, home: "ホーム", login: "ログイン", register: "登録", logout: "ログアウト", admin: "管理", save: "保存", delete: "削除", language: "言語" },
  home: { ...en.home, title: "リソースナビゲーション" },
  skins: { ...en.skins, title: "スキンライブラリ", subtitle: "コミュニティのスキンとケープを閲覧・保存し、プレイヤープロフィールに適用できます。", upload: "外観をアップロード", kindSkin: "スキン", kindCape: "ケープ", playerProfiles: "プレイヤープロフィール", wardrobe: "マイワードローブ", launcherLogin: "サードパーティーランチャーログイン", saveProfile: "プロフィールを保存", deleteProfile: "プロフィールを削除", visibilityPublic: "公開", visibilityUnlisted: "限定公開", visibilityPrivate: "非公開", copyAddress: "コピー", copied: "コピー済み" },
  assetEditor: { ...en.assetEditor, back: "詳細に戻る", skinTitle: "スキンを編集", blueprintTitle: "ブループリントを編集", submit: "編集を送信", name: "名前", introduction: "紹介", tags: "タグ", visibility: "公開範囲", visibilityPublic: "公開", visibilityUnlisted: "限定公開", visibilityPrivate: "非公開", armModel: "腕モデル", modelClassic: "クラシック", modelSlim: "スリム", reason: "変更内容", loginRequired: "編集するにはログインしてください。", submitted: "送信しました。審査が必要な言語版は承認後に公開されます。", saveFailed: "変更を保存できませんでした。", loadFailed: "編集データを読み込めませんでした。", defaultReason: "ローカライズ内容の編集" },
  mods: { ...en.mods, submission: { ...en.mods.submission, defaultLocale: "既定のコンテンツ言語", galleryUploadFailed: "ギャラリー画像をアップロードできませんでした。", modIds: { title: "Mod ID", hint: "Minecraft のバージョンごとに現在または過去の ID を登録できます。メイン ID は標準表示に使用され、すべての ID は同じグローバルリソース識別子に解決されます。", add: "ID を追加", identifier: "Mod ID", minimumVersion: "最小バージョン", maximumVersion: "最大バージョン", minimumPlaceholder: "例: 1.18", maximumPlaceholder: "空欄なら制限なし", primary: "メイン ID" }, sections: { ...en.mods.submission.sections, gallery: "ギャラリー", galleryHint: "画像は非公開 OSS に直接アップロードされ、この完全な Mod 改訂とともに審査されます。" }, actions: { ...en.mods.submission.actions, uploadGallery: "ギャラリー画像をアップロード", uploadingGallery: "アップロード中……" } } },
  catalogEditor: { ...en.catalogEditor },
  modContent: { ...en.modContent, templates: { ...en.modContent.templates, loot_table: "戦利品テーブル", game_setting: "ゲーム設定" } },
  resourceEditor: {
    ...en.resourceEditor,
    catalogShort: "リソース", catalogTitle: "グローバルリソースカタログ", catalogDescription: "アイテム、ブロック、流体、化学物質などのゲームリソースを閲覧し、手動で管理します。インポートは補助機能です。",
    search: "リソースを検索", searchPlaceholder: "ローカライズ名またはリソース ID", allKinds: "すべての種類", allRegistries: "すべての名前空間", empty: "一致するリソースはありません。", globalResource: "グローバルリソース",
    create: "リソースを作成", edit: "リソースを編集", back: "リソース一覧へ", description: "固定 ID、多言語コンテンツ、非公開 OSS 画像、構造化されたゲーム属性を管理します。すべての変更は審査とユーザー履歴に記録されます。",
    validationRequired: "種類、正規 ID、既定言語のローカライズ名を入力してください。", archiveConfirm: "このリソースをアーカイブしますか？", imageOnly: "アイコンまたはレンダー画像には画像ファイルを選択してください。", uploadFailed: "画像をアップロードできませんでした。",
    kind: "リソース種類", ownerMod: "所有 Mod のサイト ID", ownerModPlaceholder: "任意（例: create）", assetsTitle: "リソース画像", assetsDescription: "ブラウザーから非公開 OSS へ直接アップロードし、ファイル ID はこの改訂と一緒に審査されます。", icon: "アイコン", render: "レンダー画像", iconEmpty: "アイコン未登録", renderEmpty: "レンダー画像未登録", upload: "画像をアップロード", uploading: "アップロード中…", assetRecords: "添付ファイル", iconFileId: "アイコンファイル ID", renderFileId: "レンダー画像ファイル ID",
    physicalTitle: "ブロック・物理属性", physicalDescription: "ブロックやワールドリソースの物理的挙動。", hardness: "硬度", explosionResistance: "爆発耐性", friction: "摩擦", speedFactor: "移動速度係数", jumpFactor: "ジャンプ係数", lightLevel: "明るさ", requiresCorrectTool: "適正ツール必須", randomTicks: "ランダムティック", replaceable: "置換可能", air: "空気として扱う",
    toolTitle: "ツール属性", toolDescription: "採掘、戦闘、耐久値、階級、修理、エンチャント。", toolType: "ツール種類", tier: "ツール階級", repairTag: "修理素材タグ", durability: "耐久値", miningSpeed: "採掘速度", attackDamage: "攻撃力", attackSpeed: "攻撃速度", enchantability: "エンチャント適性", harvestLevel: "採掘レベル",
    renderTitle: "レンダー属性", renderDescription: "プレビュー画像とは別にレンダラー、モデル、変換を定義します。", renderMode: "レンダーモード", unset: "未設定", model: "モデル", modelResourceId: "モデルリソース ID", renderer: "レンダラー ID", scale: "拡大率", rotation: "回転 (X/Y/Z)", translation: "移動 (X/Y/Z)",
    fluidTitle: "流体属性", fluidDescription: "流体の物理・表示属性。", chemicalTitle: "化学属性", chemicalDescription: "気体、スラリー、顔料などの化学物質の属性。", density: "密度", viscosity: "粘度", temperature: "温度", luminosity: "発光レベル", tint: "着色", gaseous: "気体",
    extensionTitle: "Mod 固有の拡張データ", extensionDescription: "将来または Mod 固有の属性を JSON オブジェクトとして追加します。", applyExtensions: "拡張 JSON を適用", extensionInvalid: "予約済みセクション名を含まない有効な JSON オブジェクトを入力してください。",
  },
  contentTranslation: {
    ...en.contentTranslation,
    loading: "コンテンツ言語を解決中…", aiBadge: "AI 翻訳", humanCorrectedBadge: "人による修正", showingFallback: "{locale} のフォールバックを表示中",
    freeInProgress: "AI 翻訳中 · 1 日のトークン枠を消費しません", paidInProgress: "AI 翻訳中 · 1 日のトークン枠を消費します",
    paidExplanation: "このコンテンツを {locale} に翻訳して保存します。1 日の AI トークン枠を消費します。", translate: "翻訳", requesting: "リクエスト中…", loginToTranslate: "ログインして翻訳", noPermission: "翻訳権限がありません", readOnly: "{locale} 版は AI 翻訳専用で、手動編集できません。", failed: "AI 翻訳に失敗しました。後でもう一度お試しください。",
  },
  contentLanguage: {
    ...en.contentLanguage,
    title: "コンテンツ言語設定", description: "ローカライズされたコンテンツの第一・第二言語を選択します。対応言語は編集でき、その他の有効な BCP 47 言語は保存済み AI 翻訳として利用します。",
    primary: "第一コンテンツ言語", primaryHint: "最初に検索する言語です。未対応言語は読み取り専用の翻訳先として使用できます。", secondary: "第二コンテンツ言語", secondaryHint: "第一言語版がない場合に使用します。",
    chineseFallbackHint: "簡体字中国語と繁体字中国語は英語より先に相互フォールバックします。", editablePrimary: "編集可能な言語", translationOnlyPrimary: "翻訳専用言語", save: "言語設定を保存", saved: "コンテンツ言語設定を保存しました。", required: "第一・第二言語を入力してください。", loadFailed: "言語設定を読み込めませんでした。", saveFailed: "言語設定を保存できませんでした。",
  },
  admin: { ...en.admin, title: "管理コンソール", i18n: "多言語管理", translationManager: "翻訳管理" },
};
ja.mods = { ...ja.mods, detail: { ...ja.mods.detail, downloads: {
  ...en.mods.detail.downloads,
  title: "プロジェクトファイル", subtitle: "Minecraft バージョンとローダーを選び、外部のプロジェクトページを開かずに Mcmods-cn、Modrinth、CurseForge から直接ダウンロードできます。",
  minecraftVersion: "Minecraft バージョン", all: "すべて", loader: "ローダー", allLoaders: "すべてのローダー", source: "ダウンロード元", allSources: "すべての配布元", externalSources: "外部配布元",
  noFiles: "現在の条件に一致するファイルはありません。", loadFailed: "プロジェクトファイルを読み込めませんでした。", downloadFailed: "ダウンロードを準備できませんでした。", downloadCount: "{count} 回ダウンロード", updated: "{date} 更新", preparing: "準備中…", download: "ダウンロード",
  deleteConfirm: "サイト内のダウンロード一覧から {name} を削除しますか？", deleteFailed: "プロジェクトファイルを削除できませんでした。", providerUnavailable: "{source} は一時的に利用できません。",
  uploadTitle: "サイト内リリースファイルをアップロード", uploadDescription: "{project} の信頼できるリリースファイルをアップロードします。この操作にはプロジェクト固有のアップロード権限が必要です。", projectFile: "リリースファイル（{formats}）", displayName: "表示名", versionName: "プロジェクトバージョン", gameVersions: "Minecraft バージョン", loaders: "ローダー", releaseChannel: "リリース区分",
  channels: { release: "リリース", beta: "ベータ", alpha: "アルファ" }, unsupportedFileFormat: "対応するファイルを選択してください：{formats}。", metadataRequired: "プロジェクトバージョン、Minecraft バージョン、ローダーは必須です。", upload: "ファイルをアップロード", uploading: "アップロード中…", uploaded: "サイト内ファイルを公開しました。", uploadFailed: "サイト内ファイルをアップロードできませんでした。",
} } };
export default ja;
