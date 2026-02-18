# 🛠️ Additional Stuff

Most of the tips to address some issues are already included in-between the steps of the guide, but I am adding this section in case there are any additional tweaks or alternative configurations.

If you want a more colorful version of the stream information view than the one included, you can go to the **Formatter** tab in **AIOStreams**, and replace the text in the **Description Template** with this:

```
{stream.encode::exists["🎞️  {stream.encode}  "||""]}{stream.visualTags::exists["🎥  {stream.visualTags::join(' · ')}  "||""]}{stream.edition::exists["🎬  {stream.edition} "||""]}
{stream.audioTags::exists["🎵  {stream.audioTags::join(' · ')}  "||""]}{stream.audioChannels::exists["🎧  {stream.audioChannels::join(' · ')} "||""]}
{stream.size::>0::and::stream.seasonPack::istrue["📦  "||""]}{stream.size::>0::and::stream.seasonPack::isfalse["📦  "||""]}{stream.size::>0["{stream.size::sbytes}"||""]}{stream.bitrate::exists[" · {stream.bitrate::sbitrate::replace('Mbps','ᴹᵇᵖˢ')::replace('Kbps','ᴷᵇᵖˢ')}  "||""]}{stream.message::~Download["{tools.removeLine}"||""]}{stream.age::exists["🕒 {stream.age}"||""]}
{stream.proxied::istrue["🛠️ "||"🛠️ "]}{service.shortName::exists["[{service.shortName}] "||""]}{addon.name}{stream.type::replace('debrid',' ')::exists[" · {stream.type::replace('debrid',' ')::smallcaps}"||""]}{service.cached::isfalse::or::stream.type::=p2p::and::stream.seeders::>0["  ⇋ {stream.seeders}🌱  "||""]}
{stream.languages::exists["🔊  {stream.languageEmojis::join(' · ')::replace('ᴅᴜᴀʟ ᴀᴜᴅɪᴏ','ᴅᴜᴀʟ')::replace('ᴅᴜʙʙᴇᴅ','ᴅᴜʙ')}  "||""]}{stream.seadex["»  "||""]}{stream.seadexBest::istrue["[ʙᴇsᴛ] "||""]}{stream.seadex::istrue::and::stream.seadexBest::isfalse["[ᴀʟᴛ ʙᴇsᴛ] "||""]}
```

----------------------------------

[Other [Configuration Q&A] →](8-Configuration-QA.md)