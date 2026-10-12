'use client';
import {useRouter} from 'next/navigation';
export function RefreshReview(){const router=useRouter();return <button className="rounded border px-3 py-2" onClick={()=>router.refresh()}>Refresh read</button>;}
