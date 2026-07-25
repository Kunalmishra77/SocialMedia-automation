export const WORKFLOW_TEMPLATES = [
  { key: 'welcome_dm', name: 'Welcome DM', trigger: 'first_dm', desc: 'Greet new DM contacts automatically.' },
  { key: 'comment_to_dm', name: 'Comment → DM', trigger: 'comment_received', desc: 'DM users who comment on your posts.' },
  { key: 'story_mention', name: 'Story Mention Thanks', trigger: 'story_mention', desc: 'Thank users who mention you in stories.' },
  { key: 'hot_lead_alert', name: 'Hot Lead Alert', trigger: 'lead_temperature_changed', desc: 'Notify sales when a lead turns hot.' },
  { key: 'window_rescue', name: 'Window Expiry Rescue', trigger: 'window_expiring', desc: 'Re-engage before the 24h window closes.' },
  { key: 'post_purchase', name: 'Post-Purchase Follow-up', trigger: 'contact_tag_added', desc: 'Thank customers and ask for a review.' },
] as const
