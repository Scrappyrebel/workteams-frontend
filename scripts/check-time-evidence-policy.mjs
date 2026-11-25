import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";
import {proofRequired,proofFeatureEnabled} from "../lib/proof-policy.js";

for(const industry_key of ["janitorial_cleaning","staffing","other",null])
for(const video of [true,false]) for(const book of [true,false])
for(const siteVideo of [true,false]) for(const siteBook of [true,false]) {
 const company={industry_key,enable_shift_videos:true,enable_comm_book:true,require_walkthrough_video:video,require_book_photo:book};
 const site={require_walkthrough_video:siteVideo,require_book_photo:siteBook};
 assert.equal(proofRequired(company,"walkthrough",site),video&&siteVideo);
 assert.equal(proofRequired(company,"book",site),industry_key==="janitorial_cleaning"&&book&&siteBook);
 assert.equal(proofFeatureEnabled({...company,enable_comm_book:false},"book"),false);
 assert.equal(proofRequired({...company,enable_shift_videos:false},"walkthrough",site),false);
}
console.log("ok - 64 company/industry/site combinations keep video and book independent, with book only for cleaning");

const directory=new URL("../supabase/migrations/",import.meta.url);
const migration=readdirSync(directory).find(name=>name.endsWith("_protected_time_evidence_policy.sql"));assert.ok(migration);
const sql=readFileSync(new URL(migration,directory),"utf8");
const db=new PGlite();
const clean="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002",worker="00000000-0000-4000-8000-000000000003";
await db.exec(`
 create role anon;create role authenticated;
 create table companies(id uuid primary key,enable_comm_book boolean default true);
 create table temp_agency_config(company_id uuid,staffing_types text[]);
 create table locations(id uuid primary key);
 create table time_entries(id uuid primary key,company_id uuid,member_id uuid,clock_in timestamptz,clock_out timestamptz);
 create table comm_book(id uuid primary key,company_id uuid);
 insert into companies(id) values('${clean}'),('${other}');
 insert into temp_agency_config values('${clean}',array['cleaning']),('${other}',array['clerical']);
 insert into time_entries values('00000000-0000-4000-8000-000000000010','${clean}','${worker}','2026-11-01T12:00:00Z','2026-11-01T14:00:00Z');
`);
await db.exec(sql);
const original=(await db.query("select * from time_entries")).rows[0];assert.equal(original.clock_in_received_at,null);assert.equal(original.clock_out_received_at,null);
assert.equal((await db.query("select industry_key from companies where id=$1",[clean])).rows[0].industry_key,"janitorial_cleaning");assert.equal((await db.query("select industry_key from companies where id=$1",[other])).rows[0].industry_key,null);
console.log("ok - exact migration runs on PostgreSQL and preserves unknown historical receipt times and non-cleaning classification");

const first="00000000-0000-4000-8000-000000000011";
await db.query("insert into time_entries(id,company_id,member_id,clock_in) values($1,$2,$3,'2026-11-24T12:00:00Z')",[first,clean,worker]);
await assert.rejects(db.query("insert into time_entries(id,company_id,member_id,clock_in) values('00000000-0000-4000-8000-000000000012',$1,$2,now())",[clean,worker]),/duplicate key/);
const before=(await db.query("select * from time_entries where id=$1",[first])).rows[0];assert.ok(before.clock_in_received_at);assert.equal(before.clock_out_received_at,null);
await db.query("update time_entries set clock_out='2026-11-24T14:00:00Z',clock_in_received_at='2000-01-01',clock_out_received_at='2000-01-01' where id=$1",[first]);
const closed=(await db.query("select * from time_entries where id=$1",[first])).rows[0];assert.equal(closed.clock_in_received_at.getTime(),before.clock_in_received_at.getTime());assert.ok(closed.clock_out_received_at.getFullYear()>2000);assert.equal(closed.clock_out.getTime()-closed.clock_in.getTime(),7200000);
console.log("ok - concurrent open entry is rejected and independent receipt audit cannot replace original two-hour device times");

await db.query("insert into comm_book(id,company_id) values('00000000-0000-4000-8000-000000000020',$1)",[clean]);
await assert.rejects(db.query("insert into comm_book(id,company_id) values('00000000-0000-4000-8000-000000000021',$1)",[other]),/Communication Book/);
await db.query("update companies set enable_comm_book=false where id=$1",[clean]);
await assert.rejects(db.query("insert into comm_book(id,company_id) values('00000000-0000-4000-8000-000000000022',$1)",[clean]),/Communication Book/);
assert.equal((await db.query("select count(*)::int n from comm_book")).rows[0].n,1);
await db.exec(sql);assert.equal((await db.query("select count(*)::int n from time_entries")).rows[0].n,2);
console.log("ok - database rejects non-cleaning/disabled book creation, retains historical evidence and migration is repeatable");
assert.equal(original.punch_revision,0);assert.equal(closed.punch_revision,1);
await db.query("update time_entries set punch_revision=999 where id=$1",[first]);
assert.equal((await db.query("select punch_revision from time_entries where id=$1",[first])).rows[0].punch_revision,1);
await db.query("update time_entries set clock_out=clock_out+interval '1 minute' where id=$1",[first]);
assert.equal((await db.query("select punch_revision from time_entries where id=$1",[first])).rows[0].punch_revision,2);
await db.query("update time_entries set clock_out=null where id=$1",[first]);
assert.equal((await db.query("select punch_revision from time_entries where id=$1",[first])).rows[0].punch_revision,3);
console.log("ok - unspoofable server revisions advance on correction/reopening while proof-only writes keep the same punch revision");
await db.close();
