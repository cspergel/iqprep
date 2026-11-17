import type { SubtestId, SubtestModule } from '../core/types';
import AR from './AR';
import BD from './BD';
import CA from './CA';
import CD from './CD';
import CO from './CO';
import DS from './DS';
import DST from './DST';
import FW from './FW';
import IN from './IN';
import IST from './IST';
import LN from './LN';
import MR from './MR';
import NSL from './NSL';
import NSQ from './NSQ';
import PC from './PC';
import PS from './PS';
import RST from './RST';
import SI from './SI';
import SS from './SS';
import VC from './VC';
import VP from './VP';

export const MODULES: Record<SubtestId, SubtestModule> = {
  SI, VC, IN, CO, BD, VP, MR, FW, PC, AR, DS, PS, LN, CD, SS, CA, NSL, NSQ, IST, DST, RST,
};

export function getModule(id: SubtestId): SubtestModule {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown subtest ${id}`);
  return m;
}
