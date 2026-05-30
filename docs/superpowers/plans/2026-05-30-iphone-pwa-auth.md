# 語学アプリ iPhone対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 語学アプリをiPhoneのSafariからPWAとして使えるようにし、Supabase Auth + RLSでデータを保護する

**Architecture:** 単一HTML（index.html）にSupabase Auth認証フローを追加し、PWAマニフェスト+Service Workerでオフライン対応。全5テーブルにRLSポリシーを設定し、認証ユーザーのみデータアクセス可能にする。Cloudflare Pagesで静的ホスティング。

**Tech Stack:** Supabase Auth (magic link), Supabase RLS, PWA (manifest.json + sw.js), Cloudflare Pages

---

## File Structure

```
language-learning/
├── index.html          # Modify: 認証フロー追加、USER_ID動的化
├── manifest.json       # Create: PWAマニフェスト
├── sw.js               # Create: Service Worker
├── icon-192.svg        # Create: PWAアイコン（SVG）
├── icon-512.svg        # Create: PWAアイコン（SVG）
└── docs/               # Plan docs (not deployed)
```

## Blockers (PM/Owner Action Required)

1. **Cloudflare Pages アカウント**: wrangler未インストール。Cloudflare accountが必要。代替: GitHub Pages, Vercel
2. **Supabase Auth メール送信設定**: Magic Link用にメールプロバイダ設定が必要（Supabase dashboardで確認）
3. **Auth後のuser_id移行**: 既存データ（user_id=`00000000-...`）を実Auth IDに紐付ける作業にはAuth user作成が先

→ Task 1-3は先行実施可能。Task 4以降はブロッカー解消後。

---

### Task 1: Supabase RLS有効化 + ポリシー設定

**Files:**
- Supabase migration (via MCP)

- [ ] **Step 1: 全テーブルにRLS有効化**

```sql
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phrases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phrase_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_progress ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: user_idベースのRLSポリシー作成（user_settings, phrases, extraction_sessions, learning_progress）**

```sql
-- user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- phrases
CREATE POLICY "Users can view own phrases" ON public.phrases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own phrases" ON public.phrases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own phrases" ON public.phrases FOR UPDATE USING (auth.uid() = user_id);

-- extraction_sessions
CREATE POLICY "Users can view own sessions" ON public.extraction_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.extraction_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- learning_progress
CREATE POLICY "Users can view own progress" ON public.learning_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON public.learning_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON public.learning_progress FOR UPDATE USING (auth.uid() = user_id);
```

- [ ] **Step 3: phrase_wordsのRLSポリシー（phraseの所有者経由）**

```sql
CREATE POLICY "Users can view words of own phrases" ON public.phrase_words FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.phrases WHERE phrases.id = phrase_words.phrase_id AND phrases.user_id = auth.uid()));
CREATE POLICY "Users can insert words for own phrases" ON public.phrase_words FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.phrases WHERE phrases.id = phrase_words.phrase_id AND phrases.user_id = auth.uid()));
```

- [ ] **Step 4: RLSが有効でanonアクセスがブロックされることを確認**

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

---

### Task 2: PWAファイル作成

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icon-192.svg`
- Create: `icon-512.svg`

- [ ] **Step 1: manifest.json作成**

```json
{
  "name": "Phrase Viewer",
  "short_name": "Phrases",
  "start_url": "/index.html",
  "display": "standalone",
  "background_color": "#f5f7f3",
  "theme_color": "#9fe870",
  "icons": [
    { "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 2: sw.js作成（アプリシェルキャッシュ）**

```javascript
const CACHE_NAME = 'phrase-viewer-v1';
const SHELL_URLS = ['/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return; // API calls: network only
  e.respondWith(
    fetch(e.request).then(r => {
      const clone = r.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 3: SVGアイコン作成（192/512）**

192px:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#9fe870"/>
  <text x="96" y="120" text-anchor="middle" font-family="Inter,sans-serif" font-size="80" font-weight="700" fill="#1a1a1a">P</text>
</svg>
```

512px:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#9fe870"/>
  <text x="256" y="320" text-anchor="middle" font-family="Inter,sans-serif" font-size="220" font-weight="700" fill="#1a1a1a">P</text>
</svg>
```

---

### Task 3: index.html に認証フロー追加

**Files:**
- Modify: `index.html`

- [ ] **Step 1: `<head>`にPWAメタタグ追加**

```html
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#9fe870">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icon-192.svg">
```

- [ ] **Step 2: ログイン画面HTML追加（bodyの先頭）**

認証前はログイン画面を表示、認証後にアプリUIを表示するトグル。

- [ ] **Step 3: JavaScriptに認証ロジック追加**

- `db.auth.getSession()` でセッション確認
- 未認証 → ログイン画面表示、マジックリンク送信
- 認証済み → `auth.uid()`をUSER_IDとして使用、アプリ表示
- `db.auth.onAuthStateChange()` でセッション変化を監視

- [ ] **Step 4: USER_ID定数を動的に変更**

既存の`const USER_ID = '00000000-...'`を削除し、認証ユーザーのIDを使用。

- [ ] **Step 5: Service Worker登録コード追加**

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

### Task 4: 既存データのuser_id移行（Auth user作成後）

**BLOCKED: Auth user作成が必要**

- [ ] **Step 1: Auth user作成後、実UUIDを取得**
- [ ] **Step 2: 全テーブルのuser_idを更新**

```sql
UPDATE public.user_settings SET user_id = '<REAL_AUTH_UUID>' WHERE user_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.phrases SET user_id = '<REAL_AUTH_UUID>' WHERE user_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.extraction_sessions SET user_id = '<REAL_AUTH_UUID>' WHERE user_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.learning_progress SET user_id = '<REAL_AUTH_UUID>' WHERE user_id = '00000000-0000-0000-0000-000000000001';
```

---

### Task 5: Cloudflare Pages デプロイ（アカウント設定後）

**BLOCKED: Cloudflare account/wrangler設定が必要**

- [ ] **Step 1: git init + initial commit**
- [ ] **Step 2: wrangler install + login**
- [ ] **Step 3: wrangler pages deploy**
- [ ] **Step 4: Supabase Auth redirect URL設定**（デプロイURL確定後）
