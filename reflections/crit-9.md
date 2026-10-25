# Crit 9 reflection

The breakthrough this week came from a problem I found while playing the game myself. When my character walked close to a wall, the camera would suddenly swing upwards towards the sky, making ordinary walking difficult. I asked the AI to try several changes, but some felt worse in actual play than the earlier version. I eventually chose to return to the earlier, better camera, keep the indoor view switch, and focus on the specific problem of the camera tipping upwards near walls.

That decision made me less willing to rely on the AI to judge the controls and decide when testing was enough. Automated tests can check whether the code follows the rules we set, but passing them does not establish that the controls feel natural. I still need to notice whether the camera is comfortable, whether the character remains clearly visible, and whether a proposed change actually improves the experience. Playing the game gave me a way to judge the changes that the technical checks alone could not provide.

Afterwards, I explicitly asked the AI to complete the necessary technical checks and hand the work over so that I could test the visuals and controls myself, instead of continuing to add tests and changes. I want to be a developer who takes responsibility for that judgement. The AI can implement, investigate, and run technical checks; I need to play, identify which problems matter, and decide which changes should stay.

*AI assistance note: I wrote the original reflection in Chinese, then used AI to help translate it into English.*
