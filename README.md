# lateread

[lateread.app](https://lateread.app) is an app to save stuff you want to read later.

In the first iteration it only works with Telegram via [`@latereadbot`](https://t.me/latereadbot).

## Usage

- Go to [lateread.app](https://lateread.app) and log in via Telegram.
- From now on you can forward long messages or the ones with URLs to the bot.
- The app will extract the content and cache it for you.
- You can access your saved articles from the app.

The app is also PWA-aware, so it will work fine if you add it to your home screen.

## Concept

We can consider `lateread` as an example of the [perfect software](https://outofdesk.netlify.app/blog/perfect-software) for the audience of one (myself), but it might be useful for other folks too hence I decided to open-source it.

The whole thing can also be self-hosted.

Is this just a blob of thousands of lines of AI Slopware? Perhaps partly, yes. 

It was an experiment: see if I can orchestrate Claude and Codex to create something that resembles a properly designed app.

There're still some parts I don't quite like, but the time will come for me to address them.

This is also a learning exercise for me to try out some new things:
- [bun](https://bun.sh/)
- [hono](https://hono.dev/)
- [pico](https://pico.css/)
- [htmx](https://htmx.org/)
- [drizzle](https://drizzle.team/)
- [elevenlabs](https://elevenlabs.io/)

### Webapp
This is not exactly an SPA but rather a full SSR app. Everything is served and rendered via Hono JSX. HTMX is used to handle client-side interactions and updates. There's also some small bit of client-side vanilla js for some UI enhancements (I'm quite bad at it apparently).

### Content
The structured data is stored in SQLite database. The article's content is processed via [Readability](https://github.com/mozilla/readability) and saved as HTML on disk. During search the app calls [`ripgrep`](https://github.com/BurntSushi/ripgrep) to search the content on top of LIKE queries to the db.

### AI
The extracted article content is fed to Claude to extract tags (the discovery of that is quite limited at the moment and it also generates too many new tags I think). The user then can also generate an on-demand summary of the article that will be cached in the db (is used for search too).

Elevenlabs streaming API is integrated to provide text-to-speech functionality for the articles.

There's a notion of "subscription" to enable summaries and TTS as it incurs additional costs. Ping me at [@quiker](https://t.me/quiker) if you're interested. Or try it out yourself by running locally / self-hosting and creating a `subscription` row in the db for your user.

### Security
To safely extract the content of the URLs there's some in-house SSRF, including DNS lookups.

There's also CSP, CORS, HSTS configured. CSP allows inline scripts as this is something I can't wrap my head around with HTMX yet. CSRF would be nice too but should be easy to implement with hono.

I didn't want JWT as a dependency so there's an in-house light version of it.

## Development

1. Configure env vars
```sh
cp .env.example .env
```

2. Install dependencies
```sh
mise install
# or install `bun` and `rg` some other way if you don't use mise

bun install
```

3. Start development server
```sh
bun dev
```

## Deployment

1. Configure env vars for the platform you're deploying to
2. Build docker image
```sh
docker build -t lateread .
```

3. Deploy to a place of your choice (I picked [railway](https://railway.com/) with a volume for cache)


## Bundling

lateread uses bun's bundler to bundle parts of the app.

Frontend resources from web/scripts and web/styles get bundled into `public/styles/app-{hash}.css` and `public/scripts/app-{hash}.js`.

I've tried bundling the backend code as well, but there're two issues:
- `jsdom` does some sneaky imports so it needs to be excluded from the bundle and installed as a dep — this can be dealt with by adding `-e jsdom` to the build command.
- [process-metadata](./src/workers/process-metadata.ts) worker is being spawned via URL so it needs to be available dynamically — I haven't found a way to go around that in a nice way, except for using something else for workers instead of bun's API which I don't want yet.

This command was able to build the app with workers being broken:
```sh
bun build src/main.ts \
  --outdir ./dist \
  --target bun \
  --minify \
  --sourcemap \
  -e jsdom"
```
