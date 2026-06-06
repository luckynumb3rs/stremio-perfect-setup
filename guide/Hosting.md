---
layout: guide
title: "🖥️ Hosting"
---

# 🖥️ Hosting

Self-hosting is the next level for achieving the ultimate streaming experience. It's totally optional, but it might be necessary in a few cases that we will discuss further below. This guide covers running personal instances of multiple addons and tools on a VPS using the scripts in my [**hosting/**](https://github.com/luckynumb3rs/stremio-perfect-setup/tree/main/hosting) GitHub repo folder. The great news is that I've tried to make it as automated as it can be. You only answer a few questions, and the scripts take care of the rest. Important to note however that you still need to have at least some basic technical skills to go through with this: working with a terminal, a few commands, connecting to a remove server, etc. It's not for everyone, but also most don't need it, so if you feel you have a use case for it, let's walk through it step by step.

## Advantages

* **Your own private instances**: You get exclusive access to your addon instances, not shared with anyone else.
* **No rate limits and reliability issues**: Public shared instances sometimes have rate limiting or may be more prone to downtime or reachability issues. Your own instance gives you full access without those constraints.
* **Full control over your configuration**: Everything is yours to customize, update, and manage as you see fit on an admin level.
* **Easy updates, backups, and restores**: The setup scripts make it simple to update your stack, back it up, and restore it on a new server if needed.
* **Privacy and independence**: Your data stays on your own server, giving you complete control and peace of mind.
* **Usenet**: Last but not least, the king of self-hosting use cases in the Stremio ecosystem. There's really no other/bigger reason for wanting to self-host besides being able to use Usenet, because as it currently stands, it's practically impossible use it reliably without self-hosting. Check out my Usenet section in [**🛠️ Additional Stuff**](7-Additional-Stuff.md#usenet) to learn more.

## Requirements

* **Server / VPS**: Obviously the most important component for self-hosting, either a local server at home, or a cloud VPS. Check out [**Viren's Guide**](https://guides.viren070.me/selfhosting/oracle) for instructions on how to prepare one of the best free VPS solutions currently around.
* **Domain Name**: Needed for publicly accessing your instances through HTTPS URLs like `aiostreams.yourdomain.com`.
* **Cloudflare Account**: Optional, but highly recommended to protect your server's IP and access by proxying it through Cloudflare, and if you want *Cloudflare DDNS* to automatically update DNS records when you make changes.
* **Supabase Account**: Optional if you want to separate the data layer by storing the tables (currently automated for *AIOStreams*, *AIOMetadata*, and/or *AIOManager*) on a cloud database instead of locally.

>**📢 DISCLAIMER:**
>* The setup scripts guide you step by step through everything. Normally you don't need to understand Docker, DNS, or server administration beforehand. However, as mentioned in the beginning, you do need to have at least some basic technical understanding to be able to work through this, and even debug in case issues arise. These are complex topics and may vary depending on many factors, and I cannot address them all. Please take everything with a grain of salt and tread carefully. 
> This guide and scripts are currently a work in progress. I am not responsible for anything that might happen to your data, server, configurations, or anything else. The files are openly available for anyone to study and tinker with, and I'm doing this for fun and just trying to help. Please don't come to me with any complaints or asking for support on this, I really can't help you.
>* 🙏 This guide is based of the amazing work of [**Viren**](https://guides.viren070.me/selfhosting), and the scripts here actually fetch [**Viren's Docker Templates**](https://github.com/Viren070/docker-compose-template) from GitHub dynamically to make use of the latest configurations and modules and adds the automation layer on top. So a big thanks to **Viren** for all the effort put into the templates.

## Instructions

The main component that runs the entire automated setup is `main.sh`. The first thing it asks is **where you are running it**, and that decides the rest:

* **From your computer (recommended)**: the script prepares an SSH key and alias, copies the `hosting/` folder up to your VPS, and runs the whole setup there over that connection. You don't need to copy files or log in to the server manually.
* **On the VPS itself**: if you are already logged in to the server, the script can run the setup right there and skips the SSH and copying steps.

In both cases, these are the steps:

1. Download the `hosting/` folder by either downloading `init.sh` manually from the repo and running:

   ```bash
   chmod +x init.sh
   ./init.sh
   ```

   or run these commands directly:

   ```
   set -Eeuo pipefail
   TEMP_REPO="$(mktemp -d ./temp-repo.XXXXXX)"
   trap 'rm -rf "${TEMP_REPO}"' EXIT
   git clone --filter=blob:none --sparse https://github.com/luckynumb3rs/stremio-perfect-setup.git "${TEMP_REPO}"
   ( cd "${TEMP_REPO}" && git sparse-checkout set hosting )
   rm -rf hosting/
   cp -r "${TEMP_REPO}/hosting" ./hosting
   rm -rf "$TEMP_REPO"
   trap - EXIT
   ```

2. Once the `hosting/` folder has been downloaded, you can start the setup:

   ```bash
   ./hosting/main.sh
   ```

3. When asked **"Where Are You Running This?"**, pick *"I am on my local computer"* or *"I am on the VPS"*.

4. **If on local computer**: Follow the SSH prompts. The script helps you create or reuse a key and pick a short alias (for example `streaming`), then instructs you to add the public key to your VPS, either by uploading it according to the instructions from your VPS provider, or if you already have password access through the `ssh-copy-id` command.
   * Once connected, the script confirms it can reach the VPS, copies the files up, and runs the full guided setup on the server. When it finishes, your stack is live on the VPS.

The setup uses a visual `whiptail` interface throughout. If `whiptail` is missing the script installs it automatically, and only falls back to plain terminal prompts if that fails.

## Setup Process

However you start it, the guided setup runs on the VPS and moves through these phases, pausing for confirmation before anything destructive:

1. **Docker Setup**: installs Docker and Docker Compose if they are missing.
2. **Deployment Target**: asks where the stack should live (for example `/opt/docker`); if a setup already exists there, you choose to continue from it or overwrite it.
3. **Template Fetch**: downloads the upstream Docker template from [**Viren's Docker Templates**](https://github.com/Viren070/docker-compose-template) repository into a temporary staging area.
4. **Module Selection**: pick a preset package (on fresh installs) and toggle the modules to deploy.
5. **Config Staging**: copies the selected module configs into the staging area for review.
6. **Core Values**: asks for timezone, domain, and Let's Encrypt email.
7. **Module Automation**: runs per-module setup, such as Cloudflare DDNS or Supabase.
8. **Manual Review**: pauses and shows where the staged files are so you can inspect them.
9. **Deployment Confirmation**: asks before copying files into the Docker directory.
10. **Backup ZIP**: creates a backup of your configuration.
11. **Start Stack**: asks whether to start the containers now.

## Required Parameters

The script prompts for a handful of values it needs:

* **Timezone**: your timezone, for example `Europe/Berlin` or `America/New_York`.
* **Domain Name**: the base domain you will use for hosting, for example `example.com`. Addon URLs become subdomains like `aiostreams.example.com`.
* **Email for Let's Encrypt***: the email Traefik uses to request free Let's Encrypt SSL certificates so your services get HTTPS.
* **Cloudflare API Token** (*Optional* with `cloudflare-ddns`): lets the stack update your Cloudflare DNS records automatically when your server IP changes.
   * If you don't use Cloudflare, you need to create the DNS A records yourself after setup, pointing each subdomain to your server IP.
   * The script provides you with a list of the DNS names that it created / that you need to create manually, for your reference.
   * To create one:
      1. Open your Cloudflare dashboard → *My Profile* → *API Tokens*.
      2. *Create Token*, using the *Edit zone DNS* template.
      3. Set *Zone Resources* to your domain.
      4. Copy the token (shown once, so save it somewhere safe!).
* **Supabase Connection String + Database Password** (*Optional*): if you want to host *AIOStreams*, *AIOMetadata*, or *AIOManager*, you can store their data on Supabase instead of locally on the VPS.
   * To get the values:
      * Go to [Supabase](https://www.supabase.com), create a project, and set a password for the Database.
      * Once the project is ready, press the *Connect* icon on the header.
      * Choose *Direct Connection String* and then *Session Pooler*.
      * Copy the *URI* value (the `postgresql://...` string).
      * See *Automatic Configuration* for what the script does with them.

## Module Selection

On a **fresh install**, the script first shows a list of preset **Packages** with pre-selected bundles of modules to choose from. Pick one and its modules start preselected on the checklist that follows, where you can still add or remove anything. Pick *None* to start from scratch. The packages live in `hosting/configs/presets.json`.

* **Minimal AIO**: just the core Stremio addons (AIOStreams, AIOMetadata, AIOManager).
* **Perfect Setup**: recommended optimal setup without overcomplicating.

Then comes the checklist. Toggle modules with `Space` and confirm with `Enter`:

* **Required** (always on, cannot be toggled):
   * **Traefik**, the reverse proxy that handles HTTPS and routing, and 
   * **Authelia**, the login screen that protects your services.
* **Optional**:
   * **AIOStreams**, **AIOMetadata**, **AIOManager**: the three main Stremio addons.
   * **Honey**: a visual homepage linking to all your services.
   * **Cloudflare DDNS**: keeps your DNS records updated if your server IP changes (only useful if your domain is on Cloudflare).
   * **StremThru**: a Debrid proxy layer for advanced users.
   * **Watchly**, **AltMount**, and any other modules from the template or bundled apps.

>**📢 NOTES:**
>* You can rerun the script anytime to add or remove modules (see *Other Modes*).
>* For unattended runs you can skip the screens entirely: pass `--preset <id>` to use a package's modules (run `./main.sh --list-presets` to see them), optionally combined with `--modules` to add extras, or just `--modules` to list them yourself.

## Automatic Configuration

After you pick your modules, depending on whether there's any automated script specified for them, the script runs per-module hooks so that you can avoid editing config files by hand entirely. Currently, I have prepared scripts for the following modules.

* **AIOStreams**: Generates a secret key as needed, and you can set an optional proxy authentication (a username and password to restrict access to you).
* **AIOManager**: Encryption keys and JWT secrets are generated automatically.
* **AIOMetadata**: Encryption keys and JWT secrets are generated automatically.
* **Authelia**: Some needed cryptographic secrets (session, storage, JWT) are generated automatically, but you need to set the admin username, display name, email, and password.
* **Honey**: The dashboard is filtered to show only the services you enabled, with the correct URLs already filled in.
* **Supabase** (*Optional*): *AIOStreams*, *AIOMetadata*, and *AIOManager* use local SQLite by default. With Supabase, the script creates one isolated schema and one database user per addon inside a single project, so each addon only sees its own data and applies the schemas, roles, and permissions via the bundled SQL. You can skip it to stay on SQLite.
* **Secrets and Keys**: all security secrets are generated automatically with `openssl`.

## Other Modes

The script can also accept a lot of parameters to run in various modes. Here are the main ones:

* **Back up your setup**: Creates a ZIP file with all your configuration. Keep this somewhere safe. You can use it to restore your exact setup on a new server in minutes.

   ```bash
   ./main.sh --backup
   ```

* **Restore from a backup**: If you run this from the VPS, copy your backup ZIP there first. If you run it from your local computer, the script copies the ZIP to the VPS for you. Either way, the script imports the backed up configuration, lets you pick modules, and redeploys everything. Great for migrating to a new VPS.

   ```bash
   ./main.sh /path/to/your-backup.zip
   ```

* **Add or remove modules**: If the target directory that you set during setup (`DOCKER_DIR`) contains files and is already running in Docker, the script detects it automatically and switches to modify mode. It imports your current setup, lets you toggle modules on or off, runs hooks only for the changes you made, and does a targeted update without touching things that did not change.

* **Quick backup without prompts**: Same as backup mode but uses default paths without asking any questions.

```bash
./main.sh --backup-quick
```

## Project Structure

The scripts have been designed in a modular approach, meaning they can be extended and modified easily without affecting the core modules. Here's the structure:
* **`main.sh`**: the main orchestrator, every setup phase runs through here.
* **`init.sh`**: the bootstrapper that pulls the `hosting/` folder from GitHub.
* **`steps/`**: reusable building blocks (Docker install, template fetch, backup, deploy, start) that `main.sh` calls in order.
* **`modules/`**: one script per addon or task (for example `aiostreams.sh` sets AIOStreams defaults, `all.supabase.sh` provisions Supabase schemas). The script discovers and runs the ones matching your selection. Add your own here to extend the setup.
* **`lib/`**: shared helpers for logging, prompts, `.env` editing, ZIP creation, and template logic.
* **`db/`**: SQL for creating and deleting Supabase schemas, runnable by hand if needed.
* **`apps/`**: bundled apps that are not in Viren's upstream template (for example `watchly`, `cors-proxy`), where ach folder with a `compose.yaml` is overlaid onto the template and offered as a selectable module.
* **`configs/`**: shared config data used by the hooks, for example `presets.json` defines the pre-selected packages, and `honey.json` is the Honey dashboard catalog of services, icons, and URL templates that are not included in Viren's template.
* **`defaults.env`**: fallback values for every setting, used when you do not pass a flag.

Each file in `modules/` is self-contained and well commented, so look there to see how a specific addon is configured.

>**📢 NOTES:**
>* *After the first install, Docker group membership may need a fresh login before Docker works without `sudo`.*
>* *The temporary `.work/` folder used during setup is cleaned up automatically when the script finishes.*
>* *To inspect the staged config files before they deploy, the script pauses at the Manual Review step and shows you exactly where to find them.*
