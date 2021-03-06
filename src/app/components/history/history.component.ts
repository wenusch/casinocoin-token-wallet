import { Component, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { CasinocoinService } from '../../providers/casinocoin.service';
import { WalletService } from '../../providers/wallet.service';
import { CSCUtil } from '../../domains/csc-util';
import { AppConstants } from '../../domains/app-constants';
import { ElectronService } from '../../providers/electron.service';
import { trigger, state, style, transition, animate } from '@angular/animations';
import Big from 'big.js';
import { LokiTransaction } from '../../domains/lokijs';
import { Menu as ElectronMenu, MenuItem as ElectronMenuItem } from 'electron';
import { AppConfig } from '../../../environments/environment';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  styleUrls: ['./history.component.scss'],
  animations: [
    trigger('rowExpansionTrigger', [
        state('void', style({
            transform: 'translateX(-10%)',
            opacity: 0
        })),
        state('active', style({
            transform: 'translateX(0)',
            opacity: 1
        })),
        transition('* <=> *', animate('400ms cubic-bezier(0.86, 0, 0.07, 1)'))
    ])
]
})
export class HistoryComponent implements OnInit, AfterViewInit {

  constructor(private logger: LogService,
              private casinocoinService: CasinocoinService,
              private walletService: WalletService,
              private electronService: ElectronService,
              private router: Router,
              private route: ActivatedRoute) { }

  transactions: Array<LokiTransaction> = [];
  tx_context_menu: ElectronMenu;
  currentTX: LokiTransaction;

  ngOnInit() {
    this.logger.debug('### History ngOnInit() ###');
    this.walletService.openWalletSubject.subscribe( result => {
      if (result === AppConstants.KEY_LOADED) {
        // get all transactions
        this.transactions = this.walletService.getAllTransactions();
        this.logger.debug('### History ngOnInit() - transactions: ' + JSON.stringify(this.transactions));
      }
    });
    // define Transaction Context menu
    const tx_context_menu_template = [
      { label: 'Copy From Account',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('tx-context-menu-event', 'copy-from'); }
      },
      { label: 'Copy To Account',
        click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('tx-context-menu-event', 'copy-to'); }
      },
      { label: 'Copy Transaction ID',
          click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('tx-context-menu-event', 'copy-txid'); }
      },
      { label: 'Show in Block Explorer',
          click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('tx-context-menu-event', 'show-explorer'); }
      }
    ];
    this.tx_context_menu = this.electronService.remote.Menu.buildFromTemplate(tx_context_menu_template);
    // listen to connection context menu events
    this.electronService.ipcRenderer.on('tx-context-menu-event', (event, arg) => {
      if (arg === 'copy-to') {
        this.electronService.clipboard.writeText(this.currentTX.destination);
      } else if (arg === 'copy-from') {
        this.electronService.clipboard.writeText(this.currentTX.accountID);
      } else if (arg === 'copy-txid') {
        this.electronService.clipboard.writeText(this.currentTX.txID);
      } else if (arg === 'show-explorer') {
        this.showTransactionDetails();
      } else {
        this.logger.debug('### Context menu not implemented: ' + arg);
      }
    });
  }

  ngAfterViewInit() {
    this.logger.debug('### History - ngAfterViewInit() ###');
  }

  getTXTextColor(cell, rowData) {
    if (rowData.direction === AppConstants.KEY_WALLET_TX_OUT) {
      // outgoing tx
      cell.parentNode.parentNode.style.color = '#bf0a0a';
    } else if (rowData.direction === AppConstants.KEY_WALLET_TX_IN) {
      // incomming tx
      cell.parentNode.parentNode.style.color = '#119022';
    } else {
      // wallet tx
      cell.parentNode.parentNode.style.color = '#114490';
    }
  }

  getDirectionIconClasses(rowData) {
    if (rowData.direction === AppConstants.KEY_WALLET_TX_OUT) {
      // outgoing tx
      return ['fa', 'fa-minus', 'color_red', 'text-large'];
    } else if (rowData.direction === AppConstants.KEY_WALLET_TX_IN) {
      // incomming tx
      if (rowData.transactionType === 'SetCRNRound') {
        return ['fa', 'fa-star', 'color_green', 'text-large'];
      } else {
        return ['fa', 'fa-plus', 'color_green', 'text-large'];
      }
    } else {
      // wallet tx
      return ['fa', 'fa-minus', 'color_blue', 'text-large'];
    }
  }

  getStatusIconClasses(tx: LokiTransaction) {
    if (tx.validated) {
      return ['fa', 'fa-check', 'color_green'];
    } else if ((this.casinocoinService.ledgers[0] !== undefined) && (tx.lastLedgerSequence > this.casinocoinService.ledgers[0].ledger_index)) {
      return ['fa', 'fa-clock-o', 'color_orange'];
    } else {
      return ['fa', 'fa-ban', 'color_red'];
    }
  }

  getStatusTooltipText(tx: LokiTransaction) {
    if (tx.validated) {
      return 'Transaction validated and final.';
    } else if ((this.casinocoinService.ledgers[0] !== undefined) && (tx.lastLedgerSequence > this.casinocoinService.ledgers[0].ledger_index)) {
      return 'Transaction not yet validated. Waiting to be included until ledger ' + tx.lastLedgerSequence +
              ' (current ledger: ' + this.casinocoinService.ledgers[0].ledger_index + ').';
    } else {
      return 'Transaction cancelled.';
    }
  }

  getDescription(rowData) {
    if (rowData.memos && rowData.memos.length > 0) {
      return rowData.memos[0].memo.memoData;
    } else {
      return null;
    }
  }

  getTokenURL(rowData) {
    if (rowData.currency === 'CSC') {
      return 'https://github.com/casinocoin/CasinoCoin-Assets/raw/master/v4/casinocoin-icon-256x256.png';
    } else {
      const token = this.casinocoinService.getTokenInfo(rowData.currency);
      if (token !== undefined) {
        return token.IconURL;
      } else {
        return '';
      }
    }
  }

  showTxContextMenu(event) {
    this.logger.debug('### currentTX: ' + JSON.stringify(this.currentTX));
    this.tx_context_menu.popup({window: this.electronService.remote.getCurrentWindow()});
  }

  showTransactionDetails() {
    this.logger.debug('### showTransactionDetails: ' + JSON.stringify(this.currentTX));
    const infoUrl = AppConfig.explorer_endpoint_url + '/tx/' + this.currentTX.txID;
    this.electronService.remote.shell.openExternal(infoUrl);
  }
}
