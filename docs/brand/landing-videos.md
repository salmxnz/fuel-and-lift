# Landing page videos (optional)

The landing page works without any video: the hero and the dusk scene are drawn
and animated in code. A video only replaces the drawn sky behind them; the
phone, floating food, frosted tiles and front clouds stay on top.

## Adding one

1. Export an MP4 (H.264, 1920×1080, 8 s, no audio needed; aim for under 4 MB)
   and a JPG of its first frame for the poster.
2. Put both in `web/public/landing/`.
3. Set the paths in `web/components/landing/landing-media.ts`.

For a clean loop, generate with the same image as first and last frame, or
crossfade the last second into the first in an editor.

## Hero: pink cloud valley

> Flat 2D vector illustration, gently animated, pastel. A dreamy candy-pink sky
> over a valley of round, puffy, scalloped cloud hills in three layers: pale
> blush (#FBDCE6) in front, soft pink (#F6B8CA) in the middle, light rose at the
> back. A large soft white sun sits low in the centre, half hidden behind the
> clouds, with a faint dotted ring around it. The top third of the frame is
> almost pure white and fades smoothly into pink lower down. The cloud layers
> drift very slowly sideways at different speeds; tiny white four-point
> sparkles twinkle; a soft glow breathes around the sun. Static locked-off
> camera, no zoom, no pan. Clean flat shapes with soft gradients, no outlines,
> no texture, no grain. No text, no logos, no people, no animals, no food.
> Calm, cute, airy. Seamless loop: the last frame matches the first. 16:9,
> 1080p, 8 seconds.

Avoid: text, watermark, characters, photorealism, 3D render, hard shadows,
camera movement, fast motion.

## Closing: the same valley at dusk

> Flat 2D vector illustration, gently animated, pastel. The same round,
> scalloped cloud valley at dusk. The sky is a smooth vertical gradient: pale
> pink at the very top, then rose (#E9A0BB), mauve (#B8618A), and deep plum
> (#2E1A24) at the bottom. Cloud hills in layered plum tones, darkest in front.
> A small soft crescent moon in the upper right, tiny four-point stars
> twinkling, and a few pink petals drifting slowly down across the frame. The
> top quarter stays pale pink so it blends into a pink page above. Static
> locked-off camera, no zoom, no pan. Clean flat shapes, no outlines, no
> texture. No text, no logos, no people. Quiet and cosy. Seamless loop: the
> last frame matches the first. 16:9, 1080p, 8 seconds.
