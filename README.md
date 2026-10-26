# Beachcombing

An online artwork. Three hundred shells, gathered from an image archive, are read as depth maps, studied by an autoencoder, sorted by k-means, laid out by t-SNE and finished as an archipelago in relief.

Yidong He · Quantitative Aesthetics, Assignment 4 · 2026

## Process

- **Collection:** 300 photographs (60 kinds × 5 specimens) from [134 Shell Species Images](https://springernature.figshare.com/articles/dataset/134_shell_species_images/9122627), CC0.
- **Depth:** Depth Anything V2 Small on 320 × 320 crops, backgrounds cleaned with masks.
- **Autoencoder:** CNN, 128 × 128 input, 64-dimensional code, 1.33 M parameters; 240 training and 60 held-out images, 80 epochs, best held-out model at epoch 71 (held-out error 94.5% lower than after the first epoch).
- **Sorting and layout:** k-means (k = 6) on the codes; t-SNE (trustworthiness 0.96 at k = 10) for the free layout; linear sum assignment onto an 18 × 18 grid.

## Viewing

A static site: open `index.html` through any web server. Links can jump ahead: `?chapter=0…6`, `?finish=contour|line|plaster|fossil|nacre|rubbing`, `&layout=grid`.

## Credits

- [three.js](https://threejs.org) (MIT, `vendor/THREE_LICENSE.txt`)
- [Gap Sans](https://github.com/Interstices-/GapSans) by Interstices (SIL OFL 1.1, `fonts/GapSans-LICENSE.txt`)
- Website built with Claude Code.
