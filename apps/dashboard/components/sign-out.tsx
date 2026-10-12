'use client';
import {useState} from 'react';
export function SignOut({csrf}:{csrf:string}){const [error,setError]=useState(false);return <><button className="rounded border px-3 py-2" onClick={async()=>{try{const r=await fetch('/auth/logout',{method:'POST',headers:{'x-agentci-csrf':csrf}});if(!r.ok)throw Error();location.assign('/');}catch{setError(true);}}}>Sign out</button>{error&&<p role="alert">Sign-out failed. Try again.</p>}</>;}
