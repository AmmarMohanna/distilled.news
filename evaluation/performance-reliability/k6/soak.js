import {configuration} from './config.js';
import {journey,summary} from './common.js';
const config=configuration('soak',__ENV);
const summaryConfig=JSON.parse(JSON.stringify(config));
export const options=config.options;
export default function(){journey(config);}
export function handleSummary(data){return summary(summaryConfig,data);}
