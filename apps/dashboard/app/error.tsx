'use client';
export default function Error({reset}:{reset:()=>void}){return <section role="alert"><h1>Review unavailable</h1><p>The request did not complete. No passing review is established.</p><button className="rounded border p-2" onClick={reset}>Retry read</button></section>;}
