# Hosting Guide for Beginners

This `hosting/` folder is a guided setup for turning a fresh VPS into a Docker-based streaming stack.

You can run it two ways, and `main.sh` asks which at the very start:

- **From your own computer (recommended):** `main.sh` prepares SSH, copies the `hosting/` folder up to your VPS, and runs the whole setup there for you.
- **Directly on the VPS:** you get the files onto the server first (with `init.sh`), then run `main.sh` there; SSH is already done because you used it to log in.

If you are new to SSH, Docker, or self-hosting in general, use this guide from top to bottom once before you start clicking through the script. The steps below walk through the manual VPS path; if you run from your own computer instead, `main.sh` handles the SSH and file-copy work (Steps 1 and 2) for you automatically.

## What This Setup Does

The hosting scripts do the heavy lifting for you:

- prepare an SSH key and alias for your VPS
- install Docker and Docker Compose when needed
- fetch the upstream Docker template
- let you choose which modules you want to run
- stage the important config files in an editable area
- ask for the values the stack cannot guess for you
- apply module-specific automation, such as Supabase or Cloudflare adjustments
- deploy the final stack into your Docker directory
- optionally create a restore-friendly backup ZIP
- optionally start the stack right away

The interactive flow is designed to use a visual `whiptail` UI across the whole setup. If `whiptail` is missing, the scripts try to install it automatically first, and only fall back to plain terminal prompts if that installation is not possible.

## Before You Start

You should have these things ready:

- a Linux VPS that will actually run Docker
- SSH access to that VPS from your current machine
- a domain name if you want public HTTPS services through Traefik
- Cloudflare nameservers already active if you plan to use `cloudflare-ddns`
- a Supabase project ready only if you want the AIO modules to use Postgres instead of local SQLite

Important: the setup itself always runs on the Linux machine that will host Docker. You can launch it from your own computer — `main.sh` then prepares SSH, copies `hosting/` to the VPS, and runs it there — or you can SSH into the VPS first, get `hosting/` onto it, and run `main.sh` directly. Either way the work happens on the VPS.

## Step 1: Prepare an SSH Alias

If you already have a clean SSH alias for this VPS and it works, you can skip to Step 2.

If not, run the SSH helper from a machine where you normally open your terminal:

```bash
./hosting/steps/prepare-ssh.sh
```

What it will ask you:

- whether to use an existing SSH key or generate a new one
- if you generate a new key before you already picked an alias, what local key file name to create under `~/.ssh/`
- a reminder to add that public key while creating the VPS, through the provider's SSH-key flow, or later with `ssh-copy-id`
- the VPS IP address or hostname
- the SSH username for that VPS, often `root`
- what alias name you want, for example `streaming`

What it writes:

- your private key under `~/.ssh/` if you chose to generate one
- a `Host` block inside `~/.ssh/config`
- `HostName`, `User`, and `IdentityFile` entries for the alias

When it finishes, it will show you what to do next. This step only prepares your local SSH client. It does not magically install the key on the server for you.

You still need to place the public key on the VPS:

1. If you are still creating the VPS, paste the `.pub` key into the provider's SSH key field or upload it in the provider panel.
2. If the VPS already exists, add that public key to `~/.ssh/authorized_keys` for the target VPS user using the provider's console or documented flow.
3. If password SSH access is available, you can also use `ssh-copy-id` after the helper collects the VPS host and username.
4. After that, test the alias with `ssh your-alias`.

If `ssh-copy-id` is available on your machine, the helper will also show you a command like this:

```bash
ssh-copy-id -i ~/.ssh/streaming.pub root@YOUR_VPS_IP
```

After the key is installed on the VPS, connect with the alias:

```bash
ssh streaming
```

From this point onward, the rest of the guide assumes you are inside the VPS shell.

## Step 2: Download Only the `hosting/` Folder

If you do not want the whole repository on the VPS, you can pull only the `hosting/` part.

Run these commands on the VPS after logging in:

```bash
git clone --filter=blob:none --sparse https://github.com/luckynumb3rs/stremio-perfect-setup.git temp-repo
cd temp-repo
git sparse-checkout set hosting
cd ..
cp -r temp-repo/hosting ./hosting
rm -rf temp-repo
cd hosting/
```

Otherwise copy `hosting/init.sh` to the working folder you want and execute it with `./init.sh`.
(You may have to make it executable first with `chmod +x init.sh`)

What this does:

- clones the repository in a lightweight way
- tells Git to fetch only the `hosting/` folder
- copies that folder into your current VPS directory as a standalone working folder
- removes the temporary clone when done and takes you to `hosting/`

## Step 3: Run the Main Setup Script

Start the guided setup with:

```bash
./main.sh
```

If `whiptail` is not installed yet, the script will try to install it automatically so the whole setup can stay inside the visual interface. Only if that cannot be done will it fall back to regular terminal prompts.

## Step 4: Follow the Setup Phases

The script is divided into clear phases. Knowing what each phase means makes the whole process much less intimidating.

### Phase 1: SSH Preparation Offer

If you launched `./main.sh` interactively, it may ask whether you want to run the SSH helper first.

Use this when:

- you have not set up an SSH alias yet
- you are not sure your VPS key setup is correct

Skip it when:

- `ssh your-alias` already works
- you already prepared SSH in Step 1

### Phase 2: Docker Setup

This is one of the important confirmation points.

If Docker is not already installed, the script will clearly tell you that it is about to:

- add Docker's official package repository
- install Docker Engine
- install the Docker Compose plugin
- add your current user to the `docker` group

You must confirm before it proceeds.

Good to know:

- the main setup now usually asks for `sudo` once near the beginning so later privileged steps can continue more smoothly
- this may ask for `sudo`
- after being added to the `docker` group, some systems need a logout/login before Docker works without `sudo`
- if Docker is already installed, this phase simply reports that and moves on

### Phase 3: Deployment Target

Right after Docker setup, the script now asks for the final `DOCKER_DIR`.

That happens early on purpose.

The script inspects the chosen target before it downloads and stages anything else so it can warn you about an existing live stack before deployment.

If the target already contains one of these hosting setups, you now get a choice:

- overwrite the existing deployment later with the prepared upstream files
- continue from the existing deployment, preload its values, and add or remove modules from it

If you continue from the existing deployment:

- the existing modules start preselected in the checklist
- the later `TZ`, `DOMAIN`, and `LETSENCRYPT_EMAIL` prompts are pre-filled from the live root `.env`
- modules you deselect are removed from the final tree and their hostname env vars are cleaned up
- modules you add or remove are reconciled across the shared configs too (for example the Authelia compose and the Cloudflare DDNS domain list are rewritten to match the new module set)

To skip this prompt in a non-interactive run, pass `--modify` (reuse and add/remove modules) or `--overwrite` (replace the live stack). Without either flag, a non-interactive run defaults to overwrite.

### Phase 4: Template Fetch

The script downloads the upstream Docker template into a temporary work area under `hosting/.work/`.

This is intentional. It does not directly edit your final deployment folder first. Instead, it prepares everything in a staging area so the script can validate and modify files before deployment.

Right after the upstream template is fetched, the script overlays any **bundled apps** shipped in this repo's `hosting/apps/` folder onto the template's `apps/` directory. This is how apps that are not part of the upstream template (for example `watchly`) are added to the installable module list: each folder under `hosting/apps/` that contains a `compose.yaml` (or `compose.yml`) is copied in and becomes a selectable module in Phase 5. Upstream apps are preserved; a bundled app whose folder name matches an upstream app overrides it.

You can still add one-off apps by hand too: when running interactively, the script pauses after the fetch so you can drop extra app folders directly into `hosting/.work/docker/apps/` before module discovery continues. Use `hosting/apps/` for apps you want tracked in the repo and available on every run; use the interactive pause for a quick, one-time addition.

### Phase 5: Module Selection

This phase is the module checklist.

On a fresh install, before the checklist the script offers a list of preset **packages** — named bundles of modules defined in `configs/presets.json`. Picking one starts its modules preselected on the checklist (you can still add or remove anything); picking "none" starts with nothing preselected. This package screen is skipped when you continue from or overwrite an existing deployment.

You will see:

- required modules, which stay enabled automatically
- optional modules, which you can toggle on or off

If you chose to continue from an existing deployment in Phase 3, the modules already present in that live setup start enabled in this list.

Controls in the checklist:

- `Up` and `Down` move through the list
- `Space` toggles a module
- `Tab` moves between buttons
- `Enter` confirms

Choose only what you actually want to run. More modules means more configuration, more containers, and more moving parts.

### Phase 6: Config Staging

After module selection, the script copies the relevant config files into `hosting/.work/config/`.

This is the safe editing zone.

That means:

- the upstream template is still untouched
- the final deployment directory is still untouched
- all automatic edits happen in staging first

If you chose to continue from an existing deployment, this phase imports the live root `.env` and the selected live module files into staging first, then stages any newly added modules from the fetched template.

### Phase 7: Core Environment Questions

The script will then ask for the core values that cannot be guessed automatically:

- `TZ`
- `DOMAIN`
- `LETSENCRYPT_EMAIL`

What they mean:

- `TZ`: your server timezone, for example `Europe/Berlin`
- `DOMAIN`: the base domain used for public hostnames
- `LETSENCRYPT_EMAIL`: the email address used for certificate notices

`DOCKER_DIR` is now handled earlier in Phase 3 so the script can inspect the target before the rest of the flow continues.

The script also fills in:

- `PUID`
- `PGID`
- generated Authelia secrets

### Phase 8: Module Automation

Now the script applies module-specific logic based on what you selected.

Examples:

- `cloudflare-ddns` asks for a Cloudflare API token and adjusts DNS challenge settings
- AIO modules can offer Supabase instead of local SQLite
- some modules stage extra files or update hostnames automatically

These prompts now use the same visual UI style when possible.

Important: if you enable `cloudflare-ddns` but do not provide a token, the script disables that module instead of leaving it half-configured.

If you continued from an existing deployment, module hooks only rerun for newly added modules, plus the shared hostname-sync hooks that need to reconcile add/remove changes safely.

### Phase 9: Manual Review

Before deployment, the script pauses and tells you where the staged files are:

```bash
hosting/.work/config/
```

This is your chance to inspect the generated configuration.

Use this pause when:

- you want to double-check domains
- you want to edit module env files by hand
- you want to compare staged values with external service dashboards

Do not rename the staged files. Their names are mapped back to their original destinations automatically.

### Phase 10: Deployment Confirmation

This is another important confirmation point.

Before touching the final Docker folder, the script explicitly asks for deployment confirmation.

If you chose overwrite mode for an existing target, this confirmation warns that the live Docker tree in `DOCKER_DIR` will be replaced.

If you chose to continue from an existing target, this confirmation frames the action as an update to that live stack, including add/remove module changes.

If you confirm, it will:

- restore the staged files back into the prepared template
- sync that prepared tree into the target Docker directory
- prune out unselected modules so the final tree contains only what you chose

### Phase 11: Backup ZIP

After deployment, the script can create a backup ZIP of the prepared configuration.

For most people, say yes.

Why it matters:

- it gives you an easy restore point
- it is useful before later experiments or upgrades
- it preserves the selected modules and the staged config files in a format the script can import again

If you run `./main.sh --backup`, the script now also asks for confirmation after you enter the source Docker directory and backup output directory, so you can verify both paths before it writes the archive.

### Phase 12: Start the Stack

The script now asks before starting Docker Compose.

If you confirm, it will:

1. start the required profile first
2. start the rest of the configured stack

If you are not ready yet, you can decline here, review files again, and start manually later.

## Step 5: Read the Final Summary

At the end, the script prints a summary with things like:

- where the stack was deployed
- your detected public IP
- which hostnames were generated
- whether Cloudflare DDNS is handling them, or whether you need to create DNS A records manually

Read this part carefully. It tells you what still has to happen outside the script, especially around DNS.

## Typical First-Time Workflow

If you just want the shortest possible beginner path, this is the usual order:

1. Run `./hosting/steps/prepare-ssh.sh` on your own machine.
2. Install the `.pub` key on the VPS.
3. Connect with `ssh your-alias`.
4. Run the sparse checkout commands on the VPS.
5. `cd hosting`
6. Run `./main.sh`
7. Confirm Docker installation if needed.
8. Choose the deployment Docker directory.
9. If that target already has a live setup, choose whether to overwrite it or continue from it.
10. On a fresh install, pick a preset package (or "none"), then select your modules.
11. Fill in timezone, domain, and Let's Encrypt email.
12. Complete any module-specific prompts such as Cloudflare or Supabase.
13. Review the staged config.
14. Confirm deployment.
15. Create the backup ZIP.
16. Start the stack.
17. Finish any DNS work shown in the final summary.

## Useful Commands

Run the full guided setup:

```bash
./main.sh
```

Import a previously created backup ZIP:

```bash
./main.sh /path/to/streaming-backup.zip
```

Create a backup from an existing deployed Docker directory:

```bash
./main.sh --backup
```

Create that backup non-interactively with defaults:

```bash
./main.sh --backup-quick
```

Test the file-preparation flow without making system-level changes:

```bash
./main.sh --dry-run --skip-ssh
```

Add or remove modules on an existing deployment without prompts (`--modify` keeps the current stack and reconciles it to the new module list):

```bash
./main.sh --on-vps --modify --modules aiostreams,honey,cloudflare-ddns \
  --domain example.com --cloudflare-api-token <token> -y
```

List the preset packages (the named module bundles from `configs/presets.json`):

```bash
./main.sh --list-presets
```

Run the whole thing unattended from your local computer (prepares SSH, copies the folder to the VPS, runs it there). Here `--preset` selects a package's modules instead of listing each one, and `--modules` adds extras on top:

```bash
./main.sh --local --ssh-host vps.example.com --ssh-user root \
  --preset recommended --modules watchly --domain example.com \
  --letsencrypt-email admin@example.com -y
```

(See `./main.sh --help` for the full option list.)

## Common Notes and Pitfalls

- The setup always runs on the VPS. Either launch `./main.sh` from your own computer and let it connect and copy files over, or run it on the VPS directly — pick whichever the first prompt offers.
- If Docker group membership was just added, a fresh login may be needed before Docker works without `sudo`.
- `cloudflare-ddns` only makes sense when the domain is actually managed by Cloudflare.
- Supabase is optional. If you do not configure it, the supported addons stay on their default SQLite setup.
- The temporary work directory is cleaned up at the end, so if you want to keep artifacts from a dry run, send the backup ZIP to a directory outside `hosting/.work/`.

## Folder Layout

- `main.sh`: the main guided setup entrypoint
- `steps/`: reusable setup steps such as SSH prep, Docker install, deploy, backup, and start
- `modules/`: addon-specific automation hooks
- `apps/`: bundled apps not in the upstream template; each folder with a `compose.yaml` is overlaid onto the fetched template and offered as a selectable module
- `configs/`: shared config data used by hooks (`presets.json` defines the selectable module packages; `honey.json` is the Honey dashboard catalog)
- `db/`: Supabase-related helper scripts and SQL
- `lib/`: shared Bash helpers for prompts, staging, and template logic
- `defaults.env`: default values used by the scripts

## If You Want to Run Non-Interactively Later

Once you already understand the flow, you can pass values directly through flags. `./main.sh --help` always lists the complete, current set (the help text is generated from the comment block at the top of `main.sh`). The most common ones:

- Where it runs: `--on-vps`, `--local`
- SSH for `--local`: `--ssh-host`, `--ssh-user`, `--ssh-alias`, `--ssh-key-path`, `--skip-ssh`
- Existing setup: `--modify`, `--overwrite`, `-y` / `--assume-yes`
- Modules and target: `--preset`, `--modules`, `--docker-dir`, `--template-source` (`--list-presets` prints the available packages; `--preset` is unioned with `--modules` when both are given)
- Core environment: `--timezone`, `--domain`, `--letsencrypt-email`
- Cloudflare DDNS: `--cloudflare-api-token`, `--cloudflare-proxied`
- Supabase: `--supabase-connection-string`, `--supabase-db-password`
- Authelia: `--authelia-username`, `--authelia-displayname`, `--authelia-email`, `--authelia-password`
- Flow control: `--skip-review`, `--skip-backup`, `--skip-start`, `--dry-run`

On a fresh install the deployed root `.env` is trimmed to only the hostnames of the modules you selected (the upstream template ships a `*_HOSTNAME` line for every possible module).

That is useful for repeat deployments, but for a first run, the guided interactive flow is the safer path.
