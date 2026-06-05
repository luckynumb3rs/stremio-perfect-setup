# 🍿 STREMIO/NUVIO FULL & EASY TOTAL BEGINNER'S GUIDE
**[⚡ DEBRID / 🧲 P2P / 🌐 HTTP]** (*v2.0*)

<br>
<table class="home-showcase" role="presentation">
  <tr>
    <td align="center">
      <img src="assets/images/screens/stremio.webp" alt="Stremio">
      <div><strong>🎞️ Stremio</strong></div>
    </td>
    <td align="center">
      <img src="assets/images/screens/nuvio.webp" alt="Nuvio">
      <div><strong>🚀 Nuvio</strong></div>
    </td>
  </tr>
</table>

<div class="home-wizard-card">
  <div class="home-wizard-card__text">
    <strong>🔮 New! Quick Automated Setup</strong>
    <span>Skip the manual steps, let the wizard configure everything for you in seconds.</span>
  </div>
  <a class="home-wizard-card__btn" href="/wizard/">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4V2"/><path d="M15 10V8"/><path d="M19 6h2"/><path d="M9 6H7"/><path d="m18 3 1 1"/><path d="m11 10 1 1"/><path d="m18 9 1-1"/><path d="m11 2 1 1"/><path d="m14 7-9 9 2 2 9-9-2-2Z"/></svg>
    <span>Launch Wizard →</span>
  </a>
</div>
<br>

This is a full beginner-friendly guide for building a clean, reliable, and highly organized setup for both [**🎞️ Stremio**](https://www.stremio.com/) and [**🚀 Nuvio**](https://nuvioapp.space/), using all community best practices and including streams, metadata, catalogs, recommendations, collections, and the extra tweaks that make the whole experience feel much more polished.

**Through this guide, you will be able to configure the following stream types (will be selected in step [📚 3. AIOStreams](guide/3-AIOStreams.md)):**
* **⚡ DEBRID** is paid, but fast, safest and most reliable. Activated by selecting a Debrid service when you import the *AIOStreams* template.
* **🧲 P2P** is free, but slower and risky depending on the laws of your country. Activated automatically if you don't select a Debrid when you import the *AIOStreams* template.
* **🌐 HTTP** is free and safe, but slower and less reliable than Debrid. Activated if you enable the *HTTP Addons* option when you import the *AIOStreams* template. For **Nuvio** there's additional sources through *Plugins*, which can be added in step [**🧹 5. Configuration**](guide/5-Configuration.md).
* *In case **P2P** is an issue in your country: If you use **Debrid** (paid) or **HTTP** (free) streams, you are generally safe and don't need a VPN. **Debrid** however is still the safest and most reliable solution.*

**If this guide helps you, PLEASE UPVOTE the Reddit post for [Stremio](https://www.reddit.com/r/StremioAddons/comments/1stc6f6/stremio_perfect_setup_beginners_guide/) / [Nuvio](https://www.reddit.com/r/Nuvio/comments/1t9yub7/nuvio_perfect_setup_beginners_guide/) so it remains relevant for others to find it and also benefit from it.** 😊

*Don't be scared. Although it may look like a very long guide, it's actually just a few simple steps and very easy. I just wanted to be thorough and describe everything totally step-by-step so you understand what you're doing.*

In case you are wondering whether it's worth the effort, or you already have a Torrentio + RD setup and want to know what's better if you use this guide, here's a summary:

* **Cleaner Management**: instead of one scraper and a messy pile of addons, you use *two central addons* (AIOStreams + AIOMetadata) to keep everything *clean, consistent, and easy to manage*.
* **Better Results**: AIOStreams combines *multiple scrapers/providers*, so you usually get *more working sources* and better coverage.
* **Best Links First**: smart *sorting + filtering* pushes the most relevant options to the top (cache, quality, resolution, size, reliability signals), so less scrolling and fewer bad clicks.
* **Extra Quality Signals**: on top of general sorting, *Vidhin's regexes* help *rate/identify quality releases and trusted groups* for even better ordering.
* **Cleaner Source Selection UI**: a *minimal, modern stream list view* with the info you actually need to choose fast.
* **Netflix-like Automation**: Trakt-driven *personal lists, watch tracking, and progress syncing* and a *full-blown suggestions engine with dynamic catalogs* based on what you watch and like, for a more "recommended and organized" experience.
* **Richer Browsing**: AIOMetadata gives *better catalogs + metadata integrations* (ratings, descriptions, artwork) and lets you *remove/replace Cinemeta clutter*.

So, now that you know, it’s up to you, but if you’re up for it, let’s do it 💪!

>**📢 NOTES:**
>* If you are a **total beginner** and are curious to **understand the concepts around Stremio/Nuvio** and how it works, go to [**🔰 Beginner Concepts**](guide/0-Beginner-Concepts.md).
>* If you already followed this guide and would like to **update to the latest template** (check out the version number on the title), go to [**🔔 Updates**](guide/Updates.md).
>* **If you followed this guide and are encountering issues or have configuration questions**, go to [**❓ Configuration Q&A**](guide/8-Configuration-QA.md). If you're just starting, remember this for later in case you need it. **PLEASE avoid asking questions that are already answered there**.
>* If you alredy followed this guide for **Stremio** and you would like to migrate to **Nuvio**, you can reuse the configurations you already have for **Watchly, AIOStreams, and AIOMetadata** withut having to configure them from scratch. You just install the *Manifest URL* you get from each addon on *Nuvio*. The only difference is that *Stremio* doesn't support as many catalogs on *AIOMetadata* as *Nuvio*, so you can enable all catalogs provided if you like, but then you can't keep using it on *Stremio*. Either do a separate *AIOMetadata* (only this, not *AIOStreams*) configuration with more catalogs enabled, or keep some disabled and install the same *Manifest URL* on both apps.
>* **🙏 A very explicit special THANKS** to the **Stremio/Nuvio** developers which goes without saying, and all the community collaborators without which we wouldn't be able to enjoy any of it: [**TamTaro**](https://ko-fi.com/tamtaro) for the template base and SEL filters, [**Vidhin**](https://ko-fi.com/vidhin) for the Regexes, and the addon developers [**Viren**](https://ko-fi.com/Viren070) for AIOStreams, [**Cedya**](https://buymeacoffee.com/cedya) for AIOMetadata, [**Sanopandit**](https://ko-fi.com/timilsinabimal) for Watchly, [**Sonic**](https://ko-fi.com/sonicx161) for AIOManager, the public addon instance hosters which make everything so much simpler for most, and anyone else I may have failed to mention. All of these people continue to develop and improve them actively together with the Stremio community, so shout out to all of them for their wonderful work, and consider buying them a coffee if you agree with me! Since a few of you have also asked about tipping me for helping, even though I did it for fun and an very happy if my guide helped you, [**here**](https://ko-fi.com/luckynumb3rs) is my coffee link :)

---


- [🔰 Beginner Concepts](guide/0-Beginner-Concepts.md)
- [📝 1. Accounts Preparation](guide/1-Accounts.md)
- [⚙️ 2. Setup Initialization](guide/2-Initialization.md)
- [📚 3. AIOStreams [Find Streams]](guide/3-AIOStreams.md)
- [🔎 4. AIOMetadata [Metadata & Catalogs]](guide/4-AIOMetadata.md)
- [🧹 5. Configuration [Install & Clean-Up]](guide/5-Configuration.md)
- [🤖 6. Personalized & Automated Lists](guide/6-Personalized-Lists.md)
- [🛠️ Additional Stuff](guide/7-Additional-Stuff.md)
- [❓ Configuration Q&A](guide/8-Configuration-QA.md)
- [🎛️ AIOManager [Power Users]](guide/AIOManager-Setup.md)
- [🖥️ Hosting](guide/Hosting.md)
- [🚀 Nuvio](guide/Nuvio.md)
- [🔔 Updates](guide/Updates.md)
- [📜 Changelog](CHANGELOG.md)
