 'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateWorkspace } from '@/lib/workspaceStore';

export default function Onboarding(){
	const router = useRouter();
	const submit = (event) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		updateWorkspace({ workspace: { name: form.get('workspaceName'), industry: form.get('industry'), type: form.get('type') } });
		router.push('/dashboard');
	};
	return <main className="onboarding"><header><Link href="/" className="brand"><span className="brand-mark">C</span><span>Creatora <b>AI</b></span></Link><span>Step 1 of 2</span></header><section><div className="progress"><i/><i/></div><span className="section-kicker">CREATE YOUR WORKSPACE</span><h1>Tell us about your brand</h1><p>This helps Creatora personalize templates and generation defaults.</p><form onSubmit={submit}><label>Workspace name<input name="workspaceName" defaultValue="Arpita Studio" required/></label><label>What best describes you?<select name="type"><option>Small business / brand</option><option>Marketing agency</option><option>Freelance creator</option><option>Enterprise team</option></select></label><label>Primary industry<select name="industry"><option>E-commerce</option><option>Fashion & beauty</option><option>Food & restaurants</option><option>Real estate</option><option>Other</option></select></label><button className="button">Create workspace →</button></form></section></main>
}
