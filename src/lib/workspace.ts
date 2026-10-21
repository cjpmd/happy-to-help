import type { Company, Task } from './types';
export const WIDGETS = ['Sol','Stage & gates','Live preview','Approvals','Overnight','Metrics','Tasks','Documents','Email','Social channels','Media','Ads','Compliance due','Investors','Credits'] as const;
export type Widget = typeof WIDGETS[number];
export type Sector = 'general' | 'legal' | 'finance' | 'health' | 'education';
export interface LayoutItem { id: Widget; visible: boolean }
export const defaultLayout = (): LayoutItem[] => WIDGETS.map(id => ({id, visible: ['Sol','Stage & gates','Live preview','Approvals','Overnight','Metrics'].includes(id)}));
export interface Routine { id: string; company_id: string; title: string; cadence: 'daily'|'weekdays'|'weekly'; credits: number; enabled: boolean }
export interface CompanyDocument { id: string; company_id: string; title: string; versions: {version: number; content: string; date: string}[]; outcomes?: {title: string; complete: boolean}[] }
export interface MediaAsset { id: string; company_id: string; kind: 'image'|'video'; title: string; status: 'generating'|'ready'|'failed'; url?: string; reason?: string }
export interface EmailThread { id: string; company_id: string; subject: string; name: string; address: string; mode: 'support'|'outreach'; messages: {direction:'received'|'sent'; text:string; date:string}[] }
export interface AdAccount { company_id:string; status:'not_connected'|'demo'; daily_budget:number; hard_cap:number; spend:number; clicks:number; signups:number }
export interface Preferences { explanation:'brief'|'more'; adThreshold:number; outreachThreshold:number; publishing:boolean; signupDrop:number; whatsapp:boolean; slack:boolean }
export interface Sharing { enabled:boolean; stage:boolean; milestones:boolean; visitors:boolean; signups:boolean; mrr:boolean }
export interface TeamInvite { id:string; company_id:string; email:string; role:'founder'|'teammate'|'mentor'|'viewer'; status:'invited'|'active' }
export interface Proof { passed:number; total:number; screenshot?:string; preview?:string; pr?:string }
export interface ExtendedTask extends Task { proof?:Proof }
export interface WorkspaceDB { routines:Routine[]; documents:CompanyDocument[]; media:MediaAsset[]; emails:EmailThread[]; ads:AdAccount[]; tasks:ExtendedTask[]; layouts:Record<string,LayoutItem[]>; preferences:Record<string,Preferences>; sharing:Record<string,Sharing>; team:TeamInvite[] }
export const defaultPreferences = ():Preferences => ({explanation:'brief',adThreshold:20,outreachThreshold:25,publishing:true,signupDrop:30,whatsapp:false,slack:false});
export const defaultSharing = ():Sharing => ({enabled:false,stage:true,milestones:true,visitors:false,signups:false,mrr:false});
export function businessDefaults(type:Company['customer_type']) { return type === 'B2B' ? ['LinkedIn','Email outreach','Trust page'] : ['Instagram','TikTok','Waitlist']; }
export function monthlyCost(cadence:Routine['cadence'], credits:number) { return credits * ({daily:30,weekdays:22,weekly:4}[cadence]); }
export function hasProof(proof?:Proof) { return !!proof && proof.total > 0 && proof.passed === proof.total && !!proof.screenshot && !!proof.preview && !!proof.pr; }
export function checkClaims(text:string, sector:Sector='general') {
 const rules = [ {pattern:/\b(best|number one|world.leading|most effective)\b/gi,reason:'Unverifiable superlative'}, {pattern:/\b(guarantee\w*|will improve|double your|100% success|cuts bills)\b/gi,reason:'Promises results'}, {pattern:/\b(weak-spots report|teacher dashboard|personalised learning)\b/gi,reason:'Feature not built yet'} ];
 if(sector !== 'general') rules.push({pattern:/\b(actually works|proven|clinically|risk.free|approved|certified)\b/gi,reason:'Regulated claim needs supporting evidence'});
 return rules.flatMap(r=>Array.from(text.matchAll(r.pattern),m=>({phrase:m[0],start:m.index ?? 0,end:(m.index ?? 0)+m[0].length,reason:r.reason}))).sort((a,b)=>a.start-b.start);
}
export function workspaceSeed(companies:Company[],tasks:Task[]):WorkspaceDB {
 return {layouts:{},preferences:{},sharing:{},team:[],tasks:tasks.map(t=>({...t,status:t.status === 'done' ? 'doing' : t.status})),
 routines:companies.flatMap(c=>[{id:`${c.id}-brief`,company_id:c.id,title:'Morning brief',cadence:'daily' as const,credits:25,enabled:false},{id:`${c.id}-social`,company_id:c.id,title:c.customer_type==='B2B'?'Post to LinkedIn':'Draft Instagram post',cadence:'weekdays' as const,credits:40,enabled:false},{id:`${c.id}-investor`,company_id:c.id,title:'Weekly investor update',cadence:'weekly' as const,credits:60,enabled:false}]),
 documents:companies.flatMap(c=>['Company profile','Product roadmap','Brand & voice guide','Privacy policy','Pitch one-pager'].map((title,i)=>({id:`${c.id}-doc-${i}`,company_id:c.id,title,versions:[{version:1,content:i===0?`${c.name}\n\n${c.description}\n\nTarget customer: ${c.target_customer ?? c.customer_type}.\n90-day goal: ${c.goal_90d ?? 'Validate demand with customer interviews'}.`:i===1?'Outcomes for the next release. Prioritised using customer interviews.':i===2?'Voice: clear, encouraging and honest. Avoid guarantees and unsupported claims.':i===3?'DRAFT — requires legal review.\n\nWe collect contact details with consent for beta access. We do not sell personal data. Retention periods, lawful bases, rights and contact details must be confirmed before publication.':`${c.name}\n\n${c.description}\n\nProblem, solution and early evidence: see the company evidence board. Funding ask has not been set.`,date:'2026-10-21'}],...(i===1?{outcomes:['Quiz engine','Waitlist','Daily streaks','Pricing page','Teacher dashboard','Accessibility review','Beta launch'].map((title,j)=>({title,complete:j<2}))}:{})}))),
 media:[], emails:companies.flatMap(c=>[{id:`${c.id}-mail-1`,company_id:c.id,subject:'Classroom beta access',name:'Ms Khan',address:'teacher@example.com',mode:'support' as const,messages:[{direction:'received' as const,text:`Could we try ${c.name} with our S5 class? What information do you collect?`,date:'2026-10-21'},{direction:'sent' as const,text:'Thanks for your interest. We are reviewing the classroom beta and privacy requirements before inviting schools.',date:'2026-10-21'}]},{id:`${c.id}-mail-2`,company_id:c.id,subject:'Pilot invitation draft',name:'School pilot batch',address:'5 reviewed contacts',mode:'outreach' as const,messages:[{direction:'sent' as const,text:'Draft only — not sent. Would your team be interested in a short conversation about the pilot?',date:'2026-10-21'}]}]),
 ads:companies.map(c=>({company_id:c.id,status:'not_connected',daily_budget:6,hard_cap:50,spend:30,clicks:122,signups:20}))};
}
