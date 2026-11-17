import {findReferences} from '../lib/agent.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{return res.status(200).json(await findReferences(req.body));}catch(e){return res.status(e.status||400).json({error:e.message});}
}
