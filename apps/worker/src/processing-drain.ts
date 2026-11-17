import type {Repository,ProcessingJobMessage} from './types';

/** A real completion may drain once; duplicate deliveries never fan out. */
export async function drainNextProcessingJob(repo:Repository,queue:{send(message:ProcessingJobMessage):Promise<unknown>},briefingId:string,didProcess:boolean){
  if(!didProcess)return;
  const [next]=await repo.listProcessingJobs({briefingId,states:['queued'],order:'oldest',limit:1});
  if(!next)return;
  try{await queue.send({type:'process_raw_message',jobId:next.id,briefingId:next.briefingId,rawMessageId:next.rawMessageId})}
  catch{console.warn('PROCESSING_DRAIN_SEND_FAILED')} // durable stale-job relay retries admission
}
