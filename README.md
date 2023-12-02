## Bundu.io Development

### Installed Dependancies

Dependancies will automatically be installed when autobuilding, so please see below.

### Autobuilding

Autobuilding is set up separately for client and server.

Start autobuilding for the client:

```
npm run client
```

Start autobuilding for the server:

```
npm run server
```

Keep in mind that in order to autobuild both, you need two terminal instances.

### Hosting Platforms

-   [Hostsailor](https://hostsailor.com/kvm-vps-ssd/) for small dev VPS.
-   [Cloudflare Pages](https://pages.cloudflare.com/) for website hosting.

### Frameworks & Libraries

The client is being built using [Vite](https://vitejs.dev/) configured for vanilla Typescript. Testing is done with [Vitest](https://vitest.dev/). Client rendering is done using [Pixi.js](https://pixijs.com/) and [pixi-viewport](https://github.com/davidfig/pixi-viewport).
