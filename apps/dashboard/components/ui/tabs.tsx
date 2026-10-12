'use client';
// Reviewed local shadcn-style wrapper over Radix keyboard/ARIA primitives; no generator executes.
import * as TabsPrimitive from '@radix-ui/react-tabs';
import {useEffect,useRef,useState,type ReactNode} from 'react';
const evidenceHash=/^#evidence-[a-f0-9]{64}$/;
export function ReviewTabs({summary,evidence}:{summary:ReactNode;evidence:ReactNode}){
 const [value,setValue]=useState('summary'),[target,setTarget]=useState<string|null>(null),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const activate=()=>{if(evidenceHash.test(location.hash)){setValue('evidence');setTarget(location.hash.slice(1));}};activate();window.addEventListener('hashchange',activate);return()=>window.removeEventListener('hashchange',activate);},[]);
 useEffect(()=>{if(value==='evidence'&&target){const frame=requestAnimationFrame(()=>{const element=document.getElementById(target);if(element&&root.current?.contains(element)){element.focus({preventScroll:true});element.scrollIntoView({block:'start'});}setTarget(null);});return()=>cancelAnimationFrame(frame);}},[value,target]);
 return <TabsPrimitive.Root ref={root} value={value} onValueChange={setValue} onClickCapture={event=>{const link=(event.target as Element).closest('a');const hash=link?.getAttribute('href');if(!hash||!evidenceHash.test(hash)||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(history.state,'',hash);setValue('evidence');setTarget(hash.slice(1));}}><TabsPrimitive.List aria-label="Review details" className="flex gap-2 border-b"><TabsPrimitive.Trigger value="summary" className="p-3 focus-visible:outline-2 data-[state=active]:border-b-2">Summary</TabsPrimitive.Trigger><TabsPrimitive.Trigger value="evidence" className="p-3 focus-visible:outline-2 data-[state=active]:border-b-2">Evidence</TabsPrimitive.Trigger></TabsPrimitive.List><TabsPrimitive.Content value="summary" className="pt-4 focus-visible:outline-2">{summary}</TabsPrimitive.Content><TabsPrimitive.Content value="evidence" className="pt-4 focus-visible:outline-2">{evidence}</TabsPrimitive.Content></TabsPrimitive.Root>;
}
