import type { LottoServiceInterface } from '@rich-automation/lotto/lib/typescript/types';
import { LogLevel, LottoService } from '@rich-automation/lotto';

async function noop(_: LottoServiceInterface) {
  // noop
}

interface Params {
  debug?: boolean;
}

export class LottoRunner {
  private readonly params: Params;
  private readonly service: LottoServiceInterface;

  constructor({ debug }: Params) {
    this.params = { debug };
    this.service = new LottoService({
      controller: 'api',
      logLevel: this.params.debug ? LogLevel.DEBUG : LogLevel.NONE
    });
  }

  public prepare = noop;
  public preRun = noop;
  public run = noop;
  public postRun = noop;
  public onError = (_: unknown) => {
    // noop
  };

  private internalPrepare = async () => {
    // await installBrowser(this.params.controller, this.params.debug);
  };

  public async start() {
    try {
      await this.internalPrepare();

      await this.prepare(this.service);
      await this.preRun(this.service);
      await this.run(this.service);
      await this.postRun(this.service);
    } catch (e) {
      this.onError(e);
      process.exit(1);
    } finally {
      process.exit(0);
    }
  }
}
