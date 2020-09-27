// cspell:disable

class ITestVector {
  hex!: string;
  ucg!: string;
  lcg!: string;
  uc!: string;
  lc!: string;
  ucgu!: string;
  lcgu!: string;
  ucu!: string;
  lcu!: string;
}

const testVectors: ITestVector[] = [
  {
    hex: 'fedcba9876543210',
    ucg: '222HQ-XR7UV-M3V7M-AEJJS',
    lcg: 'aaary-7zf45-vb5fv-inss2',
    uc: 'HXR7UM3V7AEJJW',
    lc: 'r7zf4vb5finss6',
    ucgu: '222H-XR7U-M3V7-AEJJ',
    lcgu: 'aaar-7zf4-vb5f-inss',
    ucu: 'HXR7UM3V7AEJJ',
    lcu: 'r7zf4vb5finss',
  },
  {
    hex: 'f8956c40a3a2d978dbc3',
    ucg: 'Z4CQN-SJ759-NDERZ-KQY5V',
    lcg: '9ckyw-2sfdh-wmnz9-ty8d5',
    uc: 'Z4CQSJ75NDERKQY54',
    lc: '9cky2sfdwmnzty8dc',
    ucgu: 'Z4CQ-SJ75-NDER-KQY5',
    lcgu: '9cky-2sfd-wmnz-ty8d',
    ucu: 'Z4CQSJ75NDERKQY5',
    lcu: '9cky2sfdwmnzty8d',
  },
  {
    hex: 'cbd3e8a1494',
    ucg: '222ET-RNZAY-N76N9',
    lcg: 'aaan3-zw9i8-wfewh',
    uc: 'ERNZAN76NM',
    lc: 'nzw9iwfewv',
    ucgu: '222E-RNZA-N76N',
    lcgu: 'aaan-zw9i-wfew',
    ucu: 'ERNZAN76N',
    lcu: 'nzw9iwfew',
  },
  {
    hex: '867ffd93c9dff77a08f2ea98b10682cb53d590cf64ae55a823',
    ucg: 'JTZZK-V6YBQ-VZVR3-N49LS-XCED2-43N4Y-TFBXT-D68HR-ELR7M-DC35X',
    lcg: 's399t-5e8jy-595zb-wchu2-7knma-cbwc8-3pj73-megrz-nuzfv-mkbd7',
    uc: 'JTZZV6YBVZVRN49LXCED43N4TFBXD68HELR7DC35M',
    lc: 's3995e8j595zwchu7knmcbwc3pj7megrnuzfmkbdv',

    ucgu: 'JTZZ-V6YB-VZVR-N49L-XCED-43N4-TFBX-D68H-ELR7-DC35',
    lcgu: 's399-5e8j-595z-wchu-7knm-cbwc-3pj7-megr-nuzf-mkbd',
    ucu: 'JTZZV6YBVZVRN49LXCED43N4TFBXD68HELR7DC35',
    lcu: 's3995e8j595zwchu7knmcbwc3pj7megrnuzfmkbd',
  },
];

// cspell:enable;
export { testVectors };
