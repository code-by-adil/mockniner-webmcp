import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentSpeakingMode } from './AgentSpeakingMode'

describe('AgentSpeakingMode', () => {
  it('renders suggested agent prompt card with header', () => {
    const html = renderToStaticMarkup(
      <AgentSpeakingMode
        onComplete={async () => {
          throw new Error('Not implemented')
        }}
      />,
    )

    expect(html).toContain('Ask your agent to start the interview')
    expect(html).toContain('Agent prompt')
    expect(html).toContain('Conduct a full IELTS Speaking interview with me covering Parts 1, 2, and 3')
    expect(html).toContain('IELTS Speaking turn tool')
    expect(html).toContain('Copy prompt')
    expect(html).not.toContain('Kokoro')
    expect(html).not.toContain('Chrome speech recognition')
  })
})
