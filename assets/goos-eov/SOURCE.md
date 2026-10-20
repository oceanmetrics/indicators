# GOOS EOV icon badges (vendored)

The Global Ocean Observing System (GOOS) EOV icon badges, vendored so the Ocean Metrics indicators can show each
indicator's Essential Ocean Variable. Not Ocean Metrics artwork.

- **Source page:** https://goosocean.org/goos-brand-assets/
- **Drive folder:** https://drive.google.com/drive/folders/1KQnUaj8Y4MtON55tBhzfhHvSb-PPfZLo (public; downloaded with `gdown --folder`)
- **Downloaded:** 2026-10-20
- **Credit line (verbatim):** Credit: Global Ocean Observing System (GOOS)
- **Terms:** credit only; used unmodified; no GOOS logo. Nothing here grants modification. The badges stay out of the
  Ocean Metrics sprite and brand pages.
- **Processing:** none of the PNGs is re-encoded, cropped, recoloured or stripped (byte for byte as downloaded). The
  only derivatives are the 64 and 128 px lossless WebP resizes (Lanczos, aspect kept) in `webp/`, made by
  `brand/eov_trace.py --task webp`.
- **Labels:** the official EOV names on https://goosocean.org/what-we-do/framework/essential-ocean-variables/ (checked 2026-10-20). The page says "Coral cover and composition" for the
  EOV whose badge file is `Hard-coral.png` (id `hard-coral`) and marks microbes, benthic invertebrates and marine
  debris as pilot EOVs.
- **Gaps:** GOOS lists 36 EOVs; the folder holds 35 badges. Turbulent diapycnal fluxes (pilot) is missing (it appears in
  Figure 2 of the article below, a 300 ppi JPEG too small to trace). No SVGs are published.
- **Layout:** `png/<discipline>/<GOOS file>.png` (disciplines physics, biogeochemistry, bioeco, cross-disciplinary;
  GOOS's own folders are Physics, Biogeochemistry, Biology and Ecosystems and Cross-disciplinary). The three discipline
  badges sit in `png/` (GOOS short names `bioeco`, `biogeo`, `physics`; ids bioeco, biogeochemistry, physics).
  `manifest.json` is the machine-readable form of the table below.
- **Monochrome glyphs:** `brand/glyphs/eov.json` is an adaptation traced from these badges (adapted from the GOOS EOV icons (Martín Míguez et al. 2026, Front. Mar. Sci., CC BY): traced, monochrome, rescaled). Its
  licence basis is the CC BY article Martín Míguez B et al. (2026), "GOOS Essential Ocean Variables: the backbone of a
  sustained and evolving global ocean observing system", Front. Mar. Sci. 13:1737002,
  https://doi.org/10.3389/fmars.2026.1737002 (Figure 2 shows all 36 badges).
- **Download note:** a second `gdown --folder` run on 2026-10-20 was refused by Google ("many accesses") after the file
  list had been read, so the Drive ids come from that listing and every file was fetched again from
  `drive.usercontent.google.com/download?id=<id>`; all 38 sha256 sums equal the first download's.

| id | GOOS label | discipline | original path | Drive file id | pixels | sha256 (original PNG) | derivatives |
|---|---|---|---|---|---|---|---|
| `bioeco` | Biology and Ecosystems EOVs | bioeco | `EOV icons/bioeco.png` | `1LZST4ddvnbhK6TB7kjx-equEYLl3WG8Y` | 1000 x 1000 | `22a2bd74d139960121995e09fb6f810b22a94ac682555ecd42f2602c1525e3b5` | `webp/64/bioeco.webp`, `webp/128/bioeco.webp` |
| `biogeochemistry` | Biogeochemical EOVs | biogeochemistry | `EOV icons/biogeo.png` | `1f_fbJiw6X-ByZLNfIo2U_s9pznR1hah9` | 1000 x 1000 | `3fe909a835e175d81831c4f9d83d41708c18f405af342f37c406f6e51641cad1` | `webp/64/biogeochemistry.webp`, `webp/128/biogeochemistry.webp` |
| `physics` | Physical EOVs | physics | `EOV icons/physics.png` | `1dOr9B0nECDUtKkFjemNyTuviAMND555H` | 1000 x 1000 | `483dab77f4e3fc13124fb60f5c0abc59f355a33e7bea1aae6344fc164c056970` | `webp/64/physics.webp`, `webp/128/physics.webp` |
| `fish` | Fish abundance and distribution | bioeco | `EOV icons/Biology and Ecosystems/Fish.png` | `1rOkxPi_PTpVbMHrHyi_LFxkwRLC5faw4` | 1000 x 1000 | `ea1f706332f429b954e1ebffe1aa37205c5d58748ad67170223d1b7072d51883` | `webp/64/fish.webp`, `webp/128/fish.webp` |
| `hard-coral` | Coral cover and composition | bioeco | `EOV icons/Biology and Ecosystems/Hard-coral.png` | `1fa1Om_pU_-_IcaIfy9cAujalZ8-EDo41` | 1000 x 1000 | `3ed2e7f90bcac2f4be2ab595766b3cfaf5a3b3b84b881d5f117201c59c7d5b47` | `webp/64/hard-coral.webp`, `webp/128/hard-coral.webp` |
| `invertebrates` | Benthic invertebrate abundance and distribution (pilot) | bioeco | `EOV icons/Biology and Ecosystems/Invertebrates.png` | `1f9EOF9ZJP5mlahCYn5hv55qNJajx65Y4` | 1000 x 1000 | `e825f85f5e2cdd5637230c2142823f500971aafb4237384c7c20bda22aa93cfd` | `webp/64/invertebrates.webp`, `webp/128/invertebrates.webp` |
| `macroalgae` | Macroalgal canopy cover and composition | bioeco | `EOV icons/Biology and Ecosystems/Macroalgae.png` | `1HfpMb98FObOWBgC_oQhe-pRTpU1DoF2H` | 1070 x 1068 | `267e5d6bf43cf9d838cf4b1d1209cab4ebc1f0d7581519c18a3729fc95b52c87` | `webp/64/macroalgae.webp`, `webp/128/macroalgae.webp` |
| `mangroves` | Mangrove cover and composition | bioeco | `EOV icons/Biology and Ecosystems/Mangroves.png` | `1SWR8xiQUOE0PEEVUErqR1ApnMndRHZuD` | 1000 x 1000 | `720dcc659fb97a52ee74cdb66e2bd6a1f1596b954e4490eef527b46a33a804ba` | `webp/64/mangroves.webp`, `webp/128/mangroves.webp` |
| `marine-mammals` | Marine mammal abundance and distribution | bioeco | `EOV icons/Biology and Ecosystems/Marine-mammals.png` | `1cb5K_yX-Qahe6IVPWklMmIGKERoF_8gy` | 1000 x 1000 | `e9da62eaeb0a825a86f282c6c28b70981c54e22842118a34a6f0cc4cd6b03296` | `webp/64/marine-mammals.webp`, `webp/128/marine-mammals.webp` |
| `microbes` | Microbe biomass and diversity (pilot) | bioeco | `EOV icons/Biology and Ecosystems/Microbes.png` | `1MqVAUTV8kEWuOPFtFydMPB6p2EPU9lXw` | 1000 x 1000 | `d0005f7fe49b042678cd23628b9b3819d10fa3a9b0d647610fef3724cbeeac79` | `webp/64/microbes.webp`, `webp/128/microbes.webp` |
| `phytoplankton` | Phytoplankton biomass and diversity | bioeco | `EOV icons/Biology and Ecosystems/Phytoplankton.png` | `1lX0iUUYwlC_dH9luKkLYJmY7rX_y62YZ` | 1000 x 1000 | `fea9c6bef796fa6d762b1dfd1ba6bc6f899bd4aa05df924fe8f3d2024fa85d1d` | `webp/64/phytoplankton.webp`, `webp/128/phytoplankton.webp` |
| `sea-turtles` | Sea turtles abundance and distribution | bioeco | `EOV icons/Biology and Ecosystems/Sea-turtles.png` | `1g-1C6QmOdn2Jh-9GnpYwQ9ExRjL2m7eE` | 1000 x 1000 | `4e44e9fa476c67ef46ef726348dbe66bb415dcf8d4a00b9513190c9ccc9688c0` | `webp/64/sea-turtles.webp`, `webp/128/sea-turtles.webp` |
| `seabirds` | Seabirds abundance and distribution | bioeco | `EOV icons/Biology and Ecosystems/Seabirds.png` | `1tmL878ehYB63kkNl9PFhCn51F9QF7Q31` | 1000 x 1000 | `f8bac609bef66b0cf12efd4186d13225b11619da6988b53dd1d8d1123d85b8e9` | `webp/64/seabirds.webp`, `webp/128/seabirds.webp` |
| `seagrass` | Seagrass cover and composition | bioeco | `EOV icons/Biology and Ecosystems/Seagrass.png` | `1mUIHP5Om1yXFX5F7OHi8Av-y3xkiwMa5` | 1000 x 1000 | `bb4517d3e3cd1316efc5ef5d8ebbd95fc23457ad0baa34e3a806a4f155bc80a8` | `webp/64/seagrass.webp`, `webp/128/seagrass.webp` |
| `zooplankton` | Zooplankton biomass and diversity | bioeco | `EOV icons/Biology and Ecosystems/Zooplankton.png` | `1_LXUY25aIKhAF3RHvCMK5Si79gY7Yjvf` | 1000 x 1000 | `b29114c08d8f24b530cd7774e605e7cea45ae76055d3fef4aa0fec9758007c26` | `webp/64/zooplankton.webp`, `webp/128/zooplankton.webp` |
| `dissolved-organic-carbon` | Dissolved organic carbon | biogeochemistry | `EOV icons/Biogeochemistry/Dissolved-organic-carbon.png` | `13XXxECxcdnNmpES_3EUtlpjjK62zPm2c` | 1000 x 1000 | `6da73d9e5ca020629706a78866ddadde55da8bf05305525b258c24a4c6c45aae` | `webp/64/dissolved-organic-carbon.webp`, `webp/128/dissolved-organic-carbon.webp` |
| `inorganic-carbon` | Inorganic carbon | biogeochemistry | `EOV icons/Biogeochemistry/Inorganic-carbon.png` | `1yqLN58AQ5VX3GZef6hWs-Z3W1nTna4p_` | 1000 x 1000 | `8162314e298bb6ab33fbe9b76c30d1159419b9c73d9850f009d80bc4f5bd1578` | `webp/64/inorganic-carbon.webp`, `webp/128/inorganic-carbon.webp` |
| `nitrous-oxide` | Nitrous oxide | biogeochemistry | `EOV icons/Biogeochemistry/Nitrous-oxide.png` | `1O7cJGWoE-MwupKH-pFSL5Cmm5UuG5vtv` | 1000 x 1000 | `ffca17c2d1f5a496b58991089bcdf7107d66207795e3c9c1b90590e6973df8de` | `webp/64/nitrous-oxide.webp`, `webp/128/nitrous-oxide.webp` |
| `nutrients` | Nutrients | biogeochemistry | `EOV icons/Biogeochemistry/Nutrients.png` | `1vd2ZBZgKdK4-kG_qqujhSuFVyJUTf44O` | 1030 x 1020 | `8948f9326559f0a29151129f8d61ecda0fe0556b8c53a9ad328c054283c59d38` | `webp/64/nutrients.webp`, `webp/128/nutrients.webp` |
| `oxygen` | Oxygen | biogeochemistry | `EOV icons/Biogeochemistry/Oxygen.png` | `157siHl5qN_bNzF8EeJXLiFafa6-kb8f-` | 1000 x 1000 | `e384d1adee2e1a0674921332c0cb2f5811fb52892396cd12e53d70fa327637ca` | `webp/64/oxygen.webp`, `webp/128/oxygen.webp` |
| `particulate-matter` | Particulate matter | biogeochemistry | `EOV icons/Biogeochemistry/Particulate-matter.png` | `1gCxy8TSDcQrDEq00A2dwSxHf9Xg5wT7m` | 1000 x 1000 | `d1578326bbba1adb357f2345a63bb38d85533e5b9562e0572853cef1339dbd39` | `webp/64/particulate-matter.webp`, `webp/128/particulate-matter.webp` |
| `stable-carbon-isotopes` | Stable carbon isotopes | biogeochemistry | `EOV icons/Biogeochemistry/Stable-carbon-isotopes.png` | `1SN2J-Z54xLqkySVUlDOb9mED0oulB-nX` | 1000 x 1000 | `1972c131659639a93d29a8c57102dbb2506c0c8d5c7f3ebd06befc5c1af2a98e` | `webp/64/stable-carbon-isotopes.webp`, `webp/128/stable-carbon-isotopes.webp` |
| `transient-tracers` | Transient tracers | biogeochemistry | `EOV icons/Biogeochemistry/Transient-tracers.png` | `1MwtpOnKMA-Aowq0Fz1YfeNbhHuDMc1uO` | 1000 x 1000 | `f8e04edfbccd60c78e2544c1e566716625bd1407725f96e65ddd5ee14f8a4914` | `webp/64/transient-tracers.webp`, `webp/128/transient-tracers.webp` |
| `marine-debris` | Marine debris (pilot) | cross-disciplinary | `EOV icons/Cross-disciplinary/Marine-debris.png` | `1nJ2QcrRz91CHFms-IDoh4phjkiq-yHUb` | 1000 x 1000 | `afeaa5948996bd243ee5fc34c8a8adc6ace6f48ea938f50bb61c58074bf96436` | `webp/64/marine-debris.webp`, `webp/128/marine-debris.webp` |
| `ocean-colour` | Ocean colour | cross-disciplinary | `EOV icons/Cross-disciplinary/Ocean-colour.png` | `16Nkq377r5OACASDCI7j3_6FwYLlNXMoa` | 1000 x 1000 | `9b2c931db4ddaf72b4403638515f1301b3c91c2515531114e869e115a1d11fb0` | `webp/64/ocean-colour.webp`, `webp/128/ocean-colour.webp` |
| `ocean-sound` | Ocean sound | cross-disciplinary | `EOV icons/Cross-disciplinary/Ocean-sound.png` | `1Kjyqf4spotyDOnFuTFx-Fy8bCd-66tfS` | 1000 x 1000 | `c1370b3c0b4b24eb0ad526cc4abbef29ae9d7488a50481ad9c84241cd72a616f` | `webp/64/ocean-sound.webp`, `webp/128/ocean-sound.webp` |
| `ocean-bottom-pressure` | Ocean bottom pressure | physics | `EOV icons/Physics/Bottom-pressure.png` | `1Sl_8LWbZv_g8MWo0Nk_WpX1jMW8Cuivv` | 1000 x 1000 | `7eacc99fb413430137377025f77d882b72aa54ad6957bd7bce12bd0b349aa6f9` | `webp/64/ocean-bottom-pressure.webp`, `webp/128/ocean-bottom-pressure.webp` |
| `ocean-surface-heat-flux` | Ocean surface heat flux | physics | `EOV icons/Physics/Surface-heat-flux.png` | `1vvQFT7qpCajPawpEcLxcLn7Mi65BWH3O` | 1000 x 1000 | `479d3c764f054f66d8cb2315b48bbe9927b7ecd70bfa4637ea76daf811815109` | `webp/64/ocean-surface-heat-flux.webp`, `webp/128/ocean-surface-heat-flux.webp` |
| `ocean-surface-stress` | Ocean surface stress | physics | `EOV icons/Physics/Surface-stress.png` | `1xK0h2iHrWMiQ7U2GUD9k5nrcBblPGknM` | 1000 x 1000 | `7d93b24a30b7e27813ec16d4133c7679e0378c4ca86aa47bb0128af3c4c7a300` | `webp/64/ocean-surface-stress.webp`, `webp/128/ocean-surface-stress.webp` |
| `sea-ice` | Sea ice | physics | `EOV icons/Physics/Sea-ice.png` | `1kpxHaYIh6SE3PhimD3b8_nZdKvQ1b_Fe` | 1000 x 1000 | `fc9342a5c99240bbc514c015626d183a248d640458e7e9a9be42781a58d3ab87` | `webp/64/sea-ice.webp`, `webp/128/sea-ice.webp` |
| `sea-state` | Sea state | physics | `EOV icons/Physics/Sea-state.png` | `1Az7dX3E_HQCGxB0uungHszgYCsPw1wH4` | 1000 x 1000 | `5abcde0bb7909b6fceded4db6ab0574e1d26dba597c35c1852e6ebbebbe5d70d` | `webp/64/sea-state.webp`, `webp/128/sea-state.webp` |
| `sea-surface-height` | Sea surface height | physics | `EOV icons/Physics/Surface-height.png` | `1I8-g4FEk2MBYX4eeyMQsJFqmjNd8w9WZ` | 1000 x 1000 | `e6a1794277677933f0d715853338db406ea5b7a12b30d490c6bdd084aa9f8bf0` | `webp/64/sea-surface-height.webp`, `webp/128/sea-surface-height.webp` |
| `sea-surface-salinity` | Sea surface salinity | physics | `EOV icons/Physics/Surface-salinity.png` | `1YO0JTXKeMg1ywgID7ZUiqkXmm57lCq6K` | 1000 x 1000 | `c8eaac6014c9e1990a3a5690c76874a4ba3255f6ba87eb1c1f67dbd4e7b70acc` | `webp/64/sea-surface-salinity.webp`, `webp/128/sea-surface-salinity.webp` |
| `sea-surface-temperature` | Sea surface temperature | physics | `EOV icons/Physics/Surface-temperature.png` | `1JS-uEKaLmljnnWSoTOhhkkUlp8Q8HVbB` | 1000 x 1000 | `efd6a5592d370a865d004dac04dcb577040170c696038314443ee877d2829285` | `webp/64/sea-surface-temperature.webp`, `webp/128/sea-surface-temperature.webp` |
| `subsurface-currents` | Subsurface currents | physics | `EOV icons/Physics/Subsurface-currents.png` | `1BXV0y8RT34mEJyFRY4nYp5_rNxHrArmM` | 1000 x 1000 | `1f92c285c9b6b1167cb49d206cbbf96b6a4728697d1101e0bdce885c3a0d6b4c` | `webp/64/subsurface-currents.webp`, `webp/128/subsurface-currents.webp` |
| `subsurface-salinity` | Subsurface salinity | physics | `EOV icons/Physics/Subsurface-salinity.png` | `1Vjku2wn7Ymj8wYwhQtSXGP5EONhYr_93` | 1000 x 1000 | `5d3753eaef48c138004f9681b66b78818d852cb56d95c94e42cfd5cb49a92802` | `webp/64/subsurface-salinity.webp`, `webp/128/subsurface-salinity.webp` |
| `subsurface-temperature` | Subsurface temperature | physics | `EOV icons/Physics/Subsurface-temperature.png` | `1nceXF2ENA0EidJdpLX_ffPSmQjwGCw6r` | 1000 x 1000 | `5a870176c3a54f33d68bcf1869bbe9342fec3ed88cd1db5094645c0395bbb8ad` | `webp/64/subsurface-temperature.webp`, `webp/128/subsurface-temperature.webp` |
| `surface-currents` | Surface currents | physics | `EOV icons/Physics/Surface-currents.png` | `19eo6vxqAbhmvU1K7XkvLvPZ4WvMuSedG` | 1000 x 1000 | `7f3a72cf680471f95e8de17e000c01b237b58b58946bfe48b0236443190469df` | `webp/64/surface-currents.webp`, `webp/128/surface-currents.webp` |
