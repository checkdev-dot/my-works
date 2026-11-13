# Bundled fonts

Five variable font files are bundled so the app can draw letters without fetching anything. All five are under the SIL Open Font License 1.1, whose text is in `OFL.txt` (copied from the Saira project; the same licence covers the others, each with its own copyright holder).

| File | Family | Copyright | Source |
|---|---|---|---|
| RobotoFlex.ttf | Roboto Flex | The Roboto Flex Project Authors | https://github.com/googlefonts/roboto-flex |
| Saira.ttf | Saira | The Saira Project Authors | https://github.com/Omnibus-Type/Saira |
| Nunito.ttf, Nunito-Italic.ttf | Nunito | The Nunito Project Authors | https://github.com/googlefonts/nunito |
| RobotoSerif.ttf | Roboto Serif | The Roboto Serif Project Authors | https://github.com/googlefonts/RobotoSerif |

The font library the app searches is not bundled. `public/library/index.json` holds only measurements of each font, and the app loads the real font files from the Fontsource CDN at the moment it shows a result.
