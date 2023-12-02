## Bundu.io Development

### Installing Dependancies

Dependancies will automatically be installed when autobuilding, so please see below.

### Auto-building

Auto-building is set up separately for client and server.

Start auto-building for the client:

```
npm run client
```

Start auto-building for the server:

```
npm run server
```

Keep in mind that in order to auto-build both, you need two terminal instances.

### Hosting Platforms

-   [Hostsailor](https://hostsailor.com/kvm-vps-ssd/) for small dev VPS.
-   [Cloudflare Pages](https://pages.cloudflare.com/) for website hosting.

### Frameworks & Libraries

#### **[Vite](https://vitejs.dev/)**

The project is being built using Vite, configured for Vanilla Typescript. It is used for auto-building the client.

#### **[Vitest](https://vitest.dev/)**

Vite's testing framework, Vitest, is used to run our unit tests.

#### **[Pixi.js](https://pixijs.com/)**

Pixi.js is a fast WebGL based canvas renderer used for making the client.

#### **[pixi-viewport](https://github.com/davidfig/pixi-viewport)**

pixi-viewport allows for easy camera setup and zooming.
