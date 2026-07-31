export const metadata = { title: 'Privacy Policy — AI-Agentix SocialFlow' }

const UPDATED = 'July 31, 2026'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-neutral-800">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-500">Last updated: {UPDATED}</p>

      <p className="mt-6">
        AI-Agentix SocialFlow (“we”, “the platform”) helps businesses manage and automate their own social media
        accounts — replying to direct messages and comments, and scheduling content. This policy explains what data we
        process, why, and how you can have it deleted.
      </p>

      <Section title="1. Who controls your data">
        Each business (our customer) that connects its own social accounts is the data controller for its audience’s
        messages. We process that data on their behalf as a service provider, solely to deliver the automation features
        they enable.
      </Section>

      <Section title="2. Information we process">
        <ul className="ml-5 list-disc space-y-1">
          <li>Connected account details: the business’s Instagram/social account id, username and access tokens (stored encrypted).</li>
          <li>Conversation data: direct messages, comments and the sender’s public profile (name, username, follower status) needed to respond.</li>
          <li>Content you create: posts, captions, media and schedules.</li>
          <li>Operational logs required to deliver and secure the service.</li>
        </ul>
      </Section>

      <Section title="3. How we use it">
        To send and receive messages on the connected account, generate AI-assisted replies and content grounded on the
        business’s own knowledge base, schedule and publish posts, and provide analytics to the business. We do not sell
        your personal data or use message content for advertising.
      </Section>

      <Section title="4. Sharing">
        Data is shared only with infrastructure providers that operate the service (hosting, database, and the AI model
        provider used to generate replies), and with the social platforms’ official APIs to deliver messages you request.
      </Section>

      <Section title="5. Retention">
        We retain conversation and account data for as long as the business keeps its account active, and delete it on
        request or when an account is disconnected, subject to short operational backup windows.
      </Section>

      <Section title="6. Deleting your data">
        You can request deletion of your data at any time. See our{' '}
        <a href="/data-deletion" className="text-[#ea6a24] underline">Data Deletion</a> page, or email{' '}
        <a href="mailto:support@aiagentixdev.com" className="text-[#ea6a24] underline">support@aiagentixdev.com</a>. If you
        interacted with a business through Instagram, removing the app from your Instagram “Apps and websites” settings
        also revokes our access to your data from that account.
      </Section>

      <Section title="7. Contact">
        Questions about this policy: <a href="mailto:support@aiagentixdev.com" className="text-[#ea6a24] underline">support@aiagentixdev.com</a>.
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <div className="mt-2 text-neutral-700">{children}</div>
    </section>
  )
}
