import React, { useState, useEffect, useContext } from "react";
import Wenb3Modal from "web3modal";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import axios from "axios";
import { create as ipfsHttpClient } from "ipfs-http-client";

// // const client = ipfsHttpClient("https://ipfs.infura.io:5001/api/v0");

// const projectId = process.env.PROJECT_ID;
// const projectSecretKey = process.env.PROJECT_SECRET_KEY;

// const subdomain = process.env.SUBDOMAIN;


const GOERLI_RPC_URL = "https://goerli.infura.io/v3/7e5b1d4bf4314cbe9f44edd4ab2d5ad8";
const projectId = "2PvXJOEPohSdoou8ugPNORVW2BT";
const projectSecretKey =  "758a6f10102c4e9f08d8f46d2794389b";
const subdomain = "";
const auth = `Basic ${Buffer.from(`${projectId}:${projectSecretKey}`).toString(
  "base64"
  )}`;

const client = ipfsHttpClient({
  host: "infura-ipfs.io",
  port: 5001,
  protocol: "https",
  headers: {
    authorization: auth,
  },
});

//INTERNAL  IMPORT
import {
  NFTMarketplaceAddress,
  NFTMarketplaceABI,
  transferFundsAddress,
  transferFundsABI,
} from "./constants";

//---FETCHING SMART CONTRACT
const fetchContract = (signerOrProvider) =>
  new ethers.Contract(
    NFTMarketplaceAddress,
    NFTMarketplaceABI,
    signerOrProvider
  );

const connectingWithSmartContract = async () => {
  try {
    const web3Modal = new Wenb3Modal();
    const connection = await web3Modal.connect();
    const provider = new ethers.providers.Web3Provider(connection);
    const signer = provider.getSigner();
    const contract = fetchContract(signer);
    return contract;
  } catch (error) {
    console.log("Something went wrong while connecting with contract", error);
  }
};

//----TRANSFER FUNDS

const fetchTransferFundsContract = (signerOrProvider) =>
  new ethers.Contract(transferFundsAddress, transferFundsABI, signerOrProvider);

const connectToTransferFunds = async () => {
  try {
    // const web3Modal = new Wenb3Modal();
    // const connection = await web3Modal.connect();
    // const provider = new ethers.providers.Web3Provider(connection);
    const provider = new ethers.providers.JsonRpcProvider(
      "https://goerli.infura.io/v3/7e5b1d4bf4314cbe9f44edd4ab2d5ad8"
    );
    const signer = provider.getSigner();
    const contract = fetchTransferFundsContract(signer);
    return contract;
  } catch (error) {
    console.log(error);
  }
};

export const NFTMarketplaceContext = React.createContext();

export const NFTMarketplaceProvider = ({ children }) => {
  const titleData = "Discover, collect, and sell NFTs";

  //------USESTAT
  const [error, setError] = useState("");
  const [openError, setOpenError] = useState(false);
  const [currentAccount, setCurrentAccount] = useState("");
  const [accountBalance, setAccountBalance] = useState("");
  const router = useRouter();

  //---CHECK IF WALLET IS CONNECTD
  const checkIfWalletConnected = async () => {
    try {
      if (!window.ethereum)
        return setOpenError(true), setError("Install MetaMask");

      const accounts = await window.ethereum.request({
        method: "eth_accounts",
      });

      if (accounts.length) {
        setCurrentAccount(accounts[0]);
        // console.log(accounts[0]);
      } else {
        setError("No Account Found");
        setOpenError(true);
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const getBalance = await provider.getBalance(accounts[0]);
      const bal = ethers.utils.formatEther(getBalance);
      setAccountBalance(bal);
    } catch (error) {
      setError("Something wrong while connecting to wallet");
      setOpenError(true);
    }
  };

  useEffect(() => {
    checkIfWalletConnected();
    connectingWithSmartContract();
  }, []);

  //---CONNET WALLET FUNCTION
  const connectWallet = async () => {
    try {
      if (!window.ethereum)
        return setOpenError(true), setError("Install MetaMask");

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      setCurrentAccount(accounts[0]);
      // window.location.reload();
    } catch (error) {
      setError("Error while connecting to wallet");
      setOpenError(true);
    }
  };

  //---UPLOAD TO IPFS FUNCTION
  const uploadToIPFS = async (file) => {
    try {
      const added = await client.add({ content: file });
      const url = `${subdomain}/ipfs/${added.path}`;
      return url;
    } catch (error) {
      setError("Error Uploading to IPFS");
      setOpenError(true);
    }
  };

  //---CREATENFT FUNCTION
  const createNFT = async (name, price, image, description, router) => {
    if (!name || !description || !price || !image)
      return setError("Data Is Missing"), setOpenError(true);

    const data = JSON.stringify({ name, description, image });

    try {
      const added = await client.add(data);

      const url = `https://infura-ipfs.io/ipfs/${added.path}`;

      await createSale(url, price);
      router.push("/searchPage");
    } catch (error) {
      setError("Error while creating NFT");
      setOpenError(true);
    }
  };

  //--- createSale FUNCTION
  const createSale = async (url, formInputPrice, isReselling, id) => {
    try {
      console.log(url, formInputPrice, isReselling, id);
      const price = ethers.utils.parseUnits(formInputPrice, "ether");

      const contract = await connectingWithSmartContract();

      const listingPrice = await contract.getListingPrice();

      const transaction = !isReselling
        ? await contract.createToken(url, price, {
            value: listingPrice.toString(),
          })
        : await contract.resellToken(id, price, {
            value: listingPrice.toString(),
          });

      await transaction.wait();
      console.log(transaction);
    } catch (error) {
      setError("error while creating sale");
      setOpenError(true);
      console.log(error);
    }
  };

  //--FETCHNFTS FUNCTION

  const fetchNFTs = async () => {
    try {
      if (currentAccount) {
        const provider = new ethers.providers.JsonRpcProvider(GOERLI_RPC_URL
          // process.env.POLYGON_MUMBAI
        );
        console.log(provider);
        const contract = fetchContract(provider);

        const data = await contract.fetchMarketItems();

        const items = await Promise.all(
          data.map(
            async ({ tokenId, seller, owner, price: unformattedPrice }) => {
              const tokenURI = await contract.tokenURI(tokenId);

              const {
                data: { image, name, description },
              } = await axios.get(tokenURI);
              const price = ethers.utils.formatUnits(
                unformattedPrice.toString(),
                "ether"
              );

              return {
                price,
                tokenId: tokenId.toNumber(),
                seller,
                owner,
                image,
                name,
                description,
                tokenURI,
              };
            }
          )
        );

        console.log(items);
        return items;
      }
    } catch (error) {
      setError("Error while fetching NFTS");
      setOpenError(true);
      console.log(error);
    }
  };

  useEffect(() => {
    if (currentAccount) {
      fetchNFTs();
    }
  }, []);

  //--FETCHING MY NFT OR LISTED NFTs
  const fetchMyNFTsOrListedNFTs = async (type) => {
    try {
      if (currentAccount) {
        const contract = await connectingWithSmartContract();

        const data =
          type == "fetchItemsListed"
            ? await contract.fetchItemsListed()
            : await contract.fetchMyNFTs();

        const items = await Promise.all(
          data.map(
            async ({ tokenId, seller, owner, price: unformattedPrice }) => {
              const tokenURI = await contract.tokenURI(tokenId);
              const {
                data: { image, name, description },
              } = await axios.get(tokenURI);
              const price = ethers.utils.formatUnits(
                unformattedPrice.toString(),
                "ether"
              );

              return {
                price,
                tokenId: tokenId.toNumber(),
                seller,
                owner,
                image,
                name,
                description,
                tokenURI,
              };
            }
          )
        );
        return items;
      }
    } catch (error) {
      setError("Error while fetching listed NFTs");
      setOpenError(true);
    }
  };

  useEffect(() => {
    fetchMyNFTsOrListedNFTs();
  }, []);

  //---BUY NFTs FUNCTION
  const buyNFT = async (nft) => {
    try {
      const contract = await connectingWithSmartContract();
      const price = ethers.utils.parseUnits(nft.price.toString(), "ether");

      const transaction = await contract.createMarketSale(nft.tokenId, {
        value: price,
      });

      await transaction.wait();
      router.push("/author");
    } catch (error) {
      setError("Error While buying NFT");
      setOpenError(true);
    }
  };

  //------------------------------------------------------------------
  //---TRANSFER FUNDS
  const [transactionCount, setTransactionCount] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const transferEther = async (address, ether, message) => {
    try {
      if (currentAccount) {
        const contract = await connectToTransferFunds();
        console.log(address, ether, message);

        const unFormatedPrice = ethers.utils.parseEther(ether);
        // //FIRST METHOD TO TRANSFER FUND
        await ethereum.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: currentAccount,
              to: address,
              gas: "0x5208",
              value: unFormatedPrice._hex,
            },
          ],
        });

        const transaction = await contract.addDataToBlockchain(
          address,
          unFormatedPrice,
          message
        );

        console.log(transaction);

        setLoading(true);
        transaction.wait();
        setLoading(false);

        const transactionCount = await contract.getTransactionCount();
        setTransactionCount(transactionCount.toNumber());
        window.location.reload();
      }
    } catch (error) {
      console.log(error);
    }
  };

  //FETCH ALL TRANSACTION
  const getAllTransactions = async () => {
    try {
      if (ethereum) {
        const contract = await connectToTransferFunds();

        const avaliableTransaction = await contract.getAllTransactions();

        const readTransaction = avaliableTransaction.map((transaction) => ({
          addressTo: transaction.receiver,
          addressFrom: transaction.sender,
          timestamp: new Date(
            transaction.timestamp.toNumber() * 1000
          ).toLocaleString(),
          message: transaction.message,
          amount: parseInt(transaction.amount._hex) / 10 ** 18,
        }));

        setTransactions(readTransaction);
        console.log(transactions);
      } else {
        console.log("On Ethereum");
      }
    } catch (error) {
      console.log(error);
    }
  };
  return (
    <NFTMarketplaceContext.Provider
      value={{
        checkIfWalletConnected,
        connectWallet,
        uploadToIPFS,
        createNFT,
        fetchNFTs,
        fetchMyNFTsOrListedNFTs,
        buyNFT,
        createSale,
        currentAccount,
        titleData,
        setOpenError,
        openError,
        error,
        transferEther,
        getAllTransactions,
        loading,
        accountBalance,
        transactionCount,
        transactions,
      }}
    >
      {children}
    </NFTMarketplaceContext.Provider>
  );
};





// import React, { useState, useContext, useEffect } from "react";
// import Web3Modal from "web3modal";
// import { Contract, ContractFactory, ethers } from "ethers";
// import Router from "next/router";
// import { useRouter } from "next/router";
// import axios from "axios";
// import { create } from "ipfs-http-client";

// const GOERLI_RPC_URL = "https://goerli.infura.io/v3/7e5b1d4bf4314cbe9f44edd4ab2d5ad8";
// const PROJECTID = "2PvXJOEPohSdoou8ugPNORVW2BT";
// const PROJECTSECRETEKEY =  "758a6f10102c4e9f08d8f46d2794389b";
// const SUBDOMAIN = "";

// //To Upload Image to IPFS
// const projectId = PROJECTID;
// const projectSecretKey = PROJECTSECRETEKEY;
// const auth = "Basic " + Buffer.from(projectId + ":" + projectSecretKey).toString("base64");
// const subdomain = SUBDOMAIN;

// const client = create({
//   host: "ipfs.infura.io",
//   //host: "ipfs.io",
//   port: 5001,
//   protocol: "https",
//   headers: {
//     authorization: auth,
//   },
// });

// //INTERNAL IMPORT
// import { NftMarketplaceAddress, NftMarketplaceABI } from "./constants";

// // ----FETCHING OR GETTING SMART CONTRACT USING ETHERS.JS
// const fetchContract = (signerorProvider) =>
//   new ethers.Contract(NftMarketplaceAddress, NftMarketplaceABI, signerorProvider);

// //----CONNECTING WITH SMART CONTRACT
// const connectingWithSmartContract = async () => {
//    try {
//     const web3Modal = new Web3Modal();
//     const connection = await web3Modal.connect();
//     const provider = new ethers.providers.Web3Provider(connection);
//     const signer = provider.getSigner();
//     const contract = fetchContract(signer);
//     return contract;
//   } catch (error) {
//     console.log("Something went wrong while connecting with contract");
//   }
// };

// // Creating context to managing data
// export const NFTMarketplaceContext = React.createContext();



// //-----------------------------Sending data to all components---------------------------//
// export const NFTMarketplaceProvider = ({ children }) => {
//   //USE STATE
//   const [error, setError] = useState("");
//   const [openError, setOpenError] = useState(false);
//   const [currentAccount, setCurrentAccount] = useState("");
//   const [blockchain, setBlockchain] = useState(0);
//   const router = useRouter();
//   const titleData = "Изучайте, коллекционируйте и продавайте NFT";


//   // -----Check If Wallet Is Connected
//   const checkIfWalletConnected = async () => {
//     try {
//       if (!window.ethereum) return setOpenError(true), setError("Install MetaMask");
//       //----CHECK IF THERE IS ANY ACCOUNT
//       const accounts = await window.ethereum.request({
//         method: "eth_accounts",
//       });
//       if (accounts.length) {
//         setCurrentAccount(accounts[0]);
//         setBlockchain(window.ethereum.networkVersion);
//       } else {
//         setError("No Account Found");
//         setOpenError(true);
//       }
//     } catch (error) {
//       console.log(`error is ${error}`);
//       setError(`Error While Connecting Wallet`);
//       setOpenError(true);
//     }
//   };

//   // -----CONNECT WALLET FUNCTION
//   const connectWallet = async () => {
//     try {
//       if (!window.ethereum) return setOpenError(true), setError("Install MetaMask");
//       //----REQUEST WALLET
//       const accounts = await window.ethereum.request({
//         method: "eth_requestAccounts",
//       });
//       setCurrentAccount(accounts[0]);
//       setBlockchain(window.ethereum.networkVersion);
//     } catch (error) {
//       console.log(error);
//       setError(`Error While Connecting Wallet`);
//       setOpenError(true);
//     }
//   };

//   // ----UPLOAD IMAGES TO IPFS
//   const uploadToIPFS = async (file) => {
//     try {
//       console.log(file);
//       const added = await client.add({ content: file });
      
//       const url = `${subdomain}/ipfs/${added.path}`;
//       // const url = `https://ipfs.io/ipfs/${added.path}`;

//       console.log(`IPFS Image URL ${url}`);
//       return url;
//     } catch (error) {
//       console.log("Error Uploading to IPFS", error);
//       setError(`Error Uploading to IPFS`);
//       setOpenError(true);
//     }
//   };


//   // ----CREATE NFT & UPLOAD METADATA TO IPFS
//   const createNFT = async (name, price, image, description, router) => {
//     if (!name || !description || !price || !image) return setOpenError(true), setError(`Missing Data`);

//     //Convert data into JSON format
//     const data = JSON.stringify({ name, description, image });

//     // ---Add data to IPFS
//     try {
//       const added = await client.add(data);
//       const url = `${subdomain}/ipfs/${added.path}`;
//       //const url = `https://ipfs.io/ipfs/${added.path}`;
//       console.log("Meta Data URL", url);
//       await createSale(url, price);
//     } catch (error) {
//       console.log(`Error to upload IPFS${error}`);
//       setError(`Error to upload IPFS`);
//       setOpenError(true);
//     }
//   };

//   // ------INTERNAL FUNCTION TO CREATE NFT SALE
//   const createSale = async (url, formInputPrice, isReselling, id) => {
//     try {
//       const price = ethers.utils.parseUnits(formInputPrice, "ether");

//       const contract = await connectingWithSmartContract();

//       const listingPrice = await contract.getListingPrice();

//       // --CREATE NFT
//       const transaction = !isReselling
//         ? await contract.createToken(url, price, {
//             value: listingPrice.toString(),
//           })
//         : await contract.resellToken(id, price, {
//             value: listingPrice.toString(),
//           });

//       await transaction.wait();
//       router.push("/searchPage");
//     } catch (error) {
//       console.log(`Create sale error ${error}`);
//       setError(`Create sale error`);
//       setOpenError(true);
//     }
//   };

//   // ----FETCH ALL NFTs LISTED ON MARKETPLACE
//   const fetchNFTS = async () => {
//     try {
//       const provider = new ethers.providers.JsonRpcProvider(GOERLI_RPC_URL);
//       const contract = fetchContract(provider);

//       const data = await contract.fetchMarketItem();

//       // --Resolve the promise
//       const items = await Promise.all(
//         data.map(async ({ tokenId, seller, owner, price: unformattedPrice }) => {
//           const tokenURI = await contract.tokenURI(tokenId);
//           // console.log("tokenURI", tokenURI);

//           const {
//             data: { image, name, description },
//           } = await axios(tokenURI);

//           const price = ethers.utils.formatUnits(unformattedPrice.toString(), "ether");

//           return {
//             price,
//             tokenId: tokenId.toNumber(),
//             seller,
//             owner,
//             image,
//             name,
//             description,
//             tokenURI,
//           };
//         })
//       );

//       return items;
//     } catch (error) {
//       console.log(`Fectching NFT error${error}`);
//       // setError(`Fectching NFT error`);
//       // setOpenError(true);
//     }
//   };

//   // ----FETCHING MY NFTs or MY LISTED NFTs
//   const fetchMyNFTsOrListedNFTs = async (type) => {
//     try {
//       const contract = await connectingWithSmartContract();

//       const data = type == "fetchItemsListed" ? await contract.fetchItemListed() : await contract.fecthMyNFT();

//       const items = await Promise.all(
//         data.map(async ({ tokenId, seller, owner, price: unformattedPrice }) => {
//           const tokenURI = await contract.tokenURI(tokenId);
//           const {
//             data: { image, name, description },
//           } = await axios.get(tokenURI);
//           const price = ethers.utils.formatUnits(unformattedPrice.toString(), "ether");

//           return {
//             price,
//             tokenId: tokenId.toNumber(),
//             seller,
//             owner,
//             image,
//             name,
//             description,
//             tokenURI,
//           };
//         })
//       );
//       return items;
//     } catch (error) {
//       console.log(`Error while fetchMyNFTorListedNFT ${error}`);
//       // setError(`Error while fetchMyNFTorListedNFT `);
//       // setOpenError(true);
//     }
//   };

//   // ----BUY NFT FUNCTION
//   const buyNFT = async (nft) => {
//     const contract = await connectingWithSmartContract();

//     const price = ethers.utils.parseUnits(nft.price.toString(), "ether");

//     const transaction = await contract.createMarketSale(nft.tokenId, {
//       value: price,
//     });

//     await transaction.wait();
//     router.push("/author");

//     try {
//     } catch (error) {
//       console.log(`Error buy NFT ${error}`);
//       setError(`Error buy NFT`);
//       setOpenError(true);
//     }
//   };

//   // ----SetTheme
//   const setTheme = (data) => {
//     document.body.classList.toggle(data);
//   };

//   return (
//     <NFTMarketplaceContext.Provider
//       value={{
//         checkIfWalletConnected,
//         connectWallet,
//         uploadToIPFS,
//         createNFT,
//         createSale,
//         fetchNFTS,
//         fetchMyNFTsOrListedNFTs,
//         buyNFT,
//         setTheme,
//         setOpenError,
//         setError,
//         titleData,
//         currentAccount,
//         blockchain,
//         error,
//         openError,
//       }}
//     >
//       {children}
//     </NFTMarketplaceContext.Provider>
//   );
// };
