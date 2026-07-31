export const metadata = { title: 'Data Deletion — AI-Agentix SocialFlow' }

export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-[15px] leading-relaxed text-neutral-800">
      <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Data Deletion</h1>

      <p className="mt-6">
        You can have your data removed from AI-Agentix SocialFlow at any time. We honour deletion requests received both
        directly and automatically from Instagram/Meta.
      </p>

      <h2 className="mt-6 text-lg font-semibold text-neutral-900">Request deletion yourself</h2>
      <ol className="mt-2 ml-5 list-decimal space-y-1 text-neutral-700">
        <li>Email <a href="mailto:support@aiagentixdev.com" className="text-[#ea6a24] underline">support@aiagentixdev.com</a> from the address or with the Instagram username you used.</li>
        <li>We verify the request and permanently delete your associated messages, profile data and any stored tokens within 30 days, then confirm by email.</li>
      </ol>

      <h2 className="mt-6 text-lg font-semibold text-neutral-900">Automatic deletion via Instagram</h2>
      <p className="mt-2 text-neutral-700">
        If you remove our app from your Instagram <em>Settings → Apps and websites</em>, Instagram notifies us and we
        delete the data associated with your account. Our data-deletion callback returns a confirmation code you can use
        to track the request.
      </p>

      <p className="mt-6 text-sm text-neutral-500">
        Questions? <a href="mailto:support@aiagentixdev.com" className="text-[#ea6a24] underline">support@aiagentixdev.com</a>
      </p>
    </main>
  )
}
