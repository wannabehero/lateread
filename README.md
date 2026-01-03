# lateread


## Bundling

lateread uses bun's bundler to bundle parts of the app.

Frontend resources from web/scripts and web/styles get bundled into `public/styles/app-{hash}.css` and `public/scripts/app-{hash}.js`.

I've tried bundling the backend code as well, but there're two issues:
- `jsdom` does some sneaky imports so it needs to be excluded from the bundle and installed as a dep — this can be dealt with by sending as `-e jsdom`.
- [process-metadata](./src/workers/process-metadata.ts) worker is being spawn via URL so needs to be available dynamically — I haven't found a way to go around that in a nice way, except for using something else for workers instead of bun's API.

```sh
bun build src/main.ts \
    --outdir ./dist \
    --target bun \
    --minify \
    --sourcemap \
    -e jsdom"
```
