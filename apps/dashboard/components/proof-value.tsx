'use client';
import {useState} from 'react';
export function ProofValue({label,value}:{label:string;value:string}){const [copied,setCopied]=useState(false),[failed,setFailed]=useState(false);return <div className="proof-value"><span>{label}</span><div><code>{value}</code><button className="copy-button" aria-label={`Copy ${label}`} onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setFailed(false);}catch{setFailed(true);}}}>{copied?'Copied':'Copy'}</button></div>{failed&&<p role="status">Copy unavailable. Select the full value above.</p>}</div>;}
