const SignalPaletteExploration = () => (
  <DesignCanvas>
    <DCSection id="today" title="The problem"
      subtitle="Today's semantic set — brick #9c3a2e, ochre #b87333, olive #4d6b3d — is entirely warm and entirely low-chroma. It harmonizes with the stone beautifully, which is exactly why nothing can shout: every signal sits at the same volume as its own background, there is no cool hue anywhere to break the warmth, and no color is reserved for attention. Same four specimens below, rendered in the palette as it stands.">
      <DCArtboard id="before" label="Current · every signal at the same volume" width={1180} height={1150}>
        <SignalLook p={{
          id: 'current', name: 'Today', mechanism: 'As-is',
          aa: 'Lowest signal 2.83:1 · fails AA', aaPass: false,
          thesis: 'All-warm, all low-chroma. Harmonious, but nothing carries.',
          note: 'The trend deltas read as gray-green and gray-red at a glance. The SLA breach and the routine asset update are nearly the same weight. Nothing on the screen tells your eye where to land first — and the problem is measurable, not just aesthetic: the "At risk" and "No contract" pills come in at 2.85:1 and 2.83:1, and the secondary action buttons at 3.58:1, all against their own composited backgrounds. WCAG AA asks 4.5:1 for text this size. So the muted set is not merely quiet; on several signals it is below the legibility floor.',
          rise: '#4d6b3d', riseTint: 'rgba(77,107,61,0.10)',
          fall: '#9c3a2e', fallTint: 'rgba(156,58,46,0.09)',
          attend: '#b87333', attendTint: 'rgba(184,115,51,0.10)',
          crit: '#9c3a2e', critTint: 'rgba(156,58,46,0.09)',
          info: '#8a8378', infoTint: 'rgba(138,131,120,0.09)',
          focus: '#c8b99a', focusTint: 'rgba(200,185,154,0.18)', focusFg: '#2a2622',
          neutral: '#8a8378', neutralTint: 'rgba(138,131,120,0.09)',
          swatches: [['Ok', '#4d6b3d'], ['Danger', '#9c3a2e'], ['Warn', '#b87333'],
            ['Gold', '#c8b99a'], ['Ink muted', '#8a8378'], ['Border', '#e6ddd0']],
        }}/>
      </DCArtboard>
    </DCSection>

    <DCSection id="looks" title="Three looks"
      subtitle="Each uses a different mechanism to create hierarchy — pigment density, scarcity, or form. Identical specimens throughout: four trend metrics, an events list, status pills at rest, and a table with signals in place. Only the palette varies, so the comparison is honest.">
      {SIGNAL_LOOKS.map((p, i) => (
        <DCArtboard key={p.id} id={p.id}
          label={`${i + 1} · ${p.name} — ${p.mechanism}`}
          width={1180} height={p.ramps ? 1290 : 1150}>
          <SignalLook p={p}/>
        </DCArtboard>
      ))}
    </DCSection>
  </DesignCanvas>
);

Object.assign(window, { SignalPaletteExploration });
