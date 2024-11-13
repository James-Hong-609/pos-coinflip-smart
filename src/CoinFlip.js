import React, { useState, useEffect } from 'react';
import { PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import heads from '../public/heads.png'; // Adjust the import according to your file structure
import tails from '../public/tails.png'; // Adjust the import according to your file structure
import Coin from './Coin';
import './CoinToss.css';
import bs58 from 'bs58';
import CryptoJS from 'crypto-js';

import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, transfer, getAccount, createTransferInstruction } from '@solana/spl-token';

const HOUSE_PUBLIC_KEY = new PublicKey(process.env.REACT_APP_HOUSE_PUBLIC_ADDRESS); // Replace with the house's public key
const POS_TOKEN_MINT_ADDRESS = new PublicKey(process.env.REACT_APP_POS_TOKEN_MINT_ADDRESS);




const CoinFlip = ({ coinFace = [heads, tails] }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [flipAnimation, setFlipAnimation] = useState(false);
  const [face, setCoinFace ] = useState(randomCoinFace());
  const [flips, setFlips] = useState(0);
  const [headsCount, setHeadsCount] = useState(0);
  const [tailsCount, setTailsCount] = useState(0);
  const [balance, setBalance ] = useState(0);
  const [betAmount, setBetAmount] = useState(50*1e6);

  const decryptPrivateKey = () => {
    const encryptedPrivateKey = process.env.REACT_APP_ENCRYPTED_PRIVATE_KEY; // The encrypted private key (in hex)
    const encryptedIV = process.env.REACT_APP_ENCRYPTED_IV; // The encrypted IV (in hex)
    
    // Replace this with your password used for encryption (should be the same one)
    const password = process.env.REACT_APP_PASSWORD; 
    
    // Hash the password to ensure it's 32 bytes (256 bits) long
    const key = CryptoJS.SHA256(password).toString(CryptoJS.enc.Hex);
    
    // Convert the IV and encrypted private key from hex to WordArray (required by CryptoJS)
    const iv = CryptoJS.enc.Hex.parse(encryptedIV);
    const encrypted = CryptoJS.enc.Hex.parse(encryptedPrivateKey);
    
    // Decrypt the private key using AES-256-CBC
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encrypted },
      CryptoJS.enc.Hex.parse(key),
      { iv: iv }
    );
    
    // Convert the decrypted WordArray back to a UTF-8 string (the original private key)
    const decryptedPrivateKey = decrypted.toString(CryptoJS.enc.Utf8);
  
    return decryptedPrivateKey; // Returns Base64, which can be decoded using bs58
  
  }
  
  const HOUSE_PRIVATE_KEY = decryptPrivateKey();
  const housePrivateKey = bs58.decode(HOUSE_PRIVATE_KEY);
  const houseKeypair = Keypair.fromSecretKey(housePrivateKey);

  function randomCoinFace() {
    return coinFace[Math.floor(Math.random() * coinFace.length)];
  }

  useEffect(() => {
    if (publicKey) {
      getBalance();
    }
  }, [publicKey]);

  useEffect(() => {

    console.log("process.env:", process.env);
    // Get values from environment variables
    const housePublicAddress = new PublicKey(process.env.REACT_APP_HOUSE_PUBLIC_ADDRESS); // Replace with the house's public key
    const posTokenMintAddress = new PublicKey(process.env.REACT_APP_POS_TOKEN_MINT_ADDRESS);
    const housePrivateAddress = decryptPrivateKey();

    // Log them to the console or use them in your app logic
    console.log("House Public Address:", housePublicAddress);
    console.log("POS Token Mint Address:", posTokenMintAddress);
    console.log("House Private Address:", housePrivateAddress);
  }, []);

  const getBalance = async () => {
    try {
      const tokenAccountAddress = await getAssociatedTokenAddress(
        POS_TOKEN_MINT_ADDRESS,
        publicKey
      );
      console.log("tokenAccountAddress:", tokenAccountAddress.toString());
      const tokenPublicKey = new PublicKey(tokenAccountAddress);

      const accountInfo = await getAccount(connection, tokenPublicKey);
      console.log("accountInfo:", accountInfo);
      setBalance(Number(accountInfo.amount) / 1e6);
  
    } catch (error) {
      console.error("Error fetching balance:", error);
      if (error.name === 'TokenAccountNotFoundError') {
        console.warn("Token account not found, creating new associated token account...");
        // Create token account logic...
      } else {
        console.error("Failed to fetch balance:", error);
      }
    }
  };

  const reset = () => {
    setFlips(0);
    setHeadsCount(0);
    setTailsCount(0);
  };

  let flipCoinInner = 'flip-coin-inner';

  if (flipAnimation) {
    flipCoinInner += 'flip-animation';
  }

  const flipCoin = async (e) => {


    console.log("house publickey:", process.env);
    setFlipAnimation(true);

    const buttonValue = e.target.value;
    console.log("Button value:", buttonValue);
    // setTimeout(() => {
    //   setCoinFace(changeFace === heads ? coinFace[0] : coinFace[1]);
    //   setHeadsCount(prev => changeFace === heads ? prev + 1 : prev);
    //   setTailsCount(prev => changeFace === tails ? prev + 1 : prev);
    //   setFlips(prev => prev + 1);
    // }, 50);


    setTimeout(() => {
      setFlipAnimation(false);
    }, 100);
    if (!publicKey) {
      alert('Please connect your wallet!');
      return;
    }

    setLoading(true);
    setResult(null);

    try {

      const playerTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        publicKey,
        POS_TOKEN_MINT_ADDRESS,
        publicKey
      );

      const houseTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        publicKey,
        POS_TOKEN_MINT_ADDRESS,
        HOUSE_PUBLIC_KEY
      );

      if (!playerTokenAccount || !houseTokenAccount) {
        throw new Error('Token accounts are undefined');
      }
      console.log("fromTokenAccount:", playerTokenAccount.address.toString(), "toTokenAccount:", houseTokenAccount.address.toString());

      const transaction = new Transaction().add(
        createTransferInstruction(
          playerTokenAccount.address,
          houseTokenAccount.address,
          publicKey,
          betAmount,
          [],
          TOKEN_PROGRAM_ID
        )
      );

      const signature = await sendTransaction(transaction, connection);

      // Check the status of the transaction
      async function checkTransactionStatus(signature) {
        try {
          // Wait for the transaction to be confirmed (finalized)
          const confirmation = await connection.confirmTransaction(signature, 'confirmed'); // 'confirmed' or 'finalized'
          
          if (confirmation.value.err) {
            console.error("Transaction failed:", confirmation.value.err);
            return false; // Transaction failed
          }
          
          console.log("Transaction successful:", confirmation);
          return true; // Transaction successful
        } catch (error) {
          console.error("Error confirming transaction:", error);
          return false; // Error occurred during confirmation
        }
      }

      // Call the check function
      const isSuccess = await checkTransactionStatus(signature);

      if(isSuccess) {
        const result = randomCoinFace();
        console.log("result", result);
        
        if (buttonValue === result) {
          const transaction = new Transaction().add(
            createTransferInstruction(
              houseTokenAccount.address,
              playerTokenAccount.address,
              HOUSE_PUBLIC_KEY,
              betAmount * 2,
              [],
              TOKEN_PROGRAM_ID
            )
          );

          const signers = [houseKeypair];
          console.log("keypair:", houseKeypair);
    
          try {
            const signature = await sendAndConfirmTransaction(connection, transaction, signers, {
              commitment: 'confirmed', // Or 'finalized' if you want stronger confirmation
              //preflightCommitment: 'processed', // Optional, helps ensure the transaction is valid before sending
            });
            setResult('You won 50 POS tokens!');

            console.log("Transaction confirmed with signature:", signature);
          } catch (error) {
            console.error("Transaction failed:", error);
          }
         }else {
          console.log("You lost 50 POS tokens");
          setResult('You lost 50 POS tokens.');
        }
      } 

      await getBalance();
    } catch (error) {
      console.error('Transaction failed:', error);
      setResult('Transaction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    // <div>
    //   <button onClick={flipCoin} disabled={loading}>
    //     {loading ? 'Flipping...' : 'Flip Coin'}
    //   </button>
    //   {result && <p>{result}</p>}
    // </div>
    <div className="CoinToss">
      <h1>Coin Toss</h1>
      <p>Balance: {balance} POS</p>
      <div className="flip-coin">
        <div className={flipCoinInner}>
          <Coin face={face}/>
        </div>
      </div>
      <button disabled={loading} value={heads} onClick={flipCoin} >
        {loading ? 'Waiting...' : 'Toss Head!'}
      </button>
      <button disabled={loading} onClick={flipCoin} value={tails}>
        {loading ? 'Waiting...' : 'Toss Tail!'}
      </button>
      <button onClick={reset}>Reset</button>
     
      {result && <p>{result}</p>}
    
    </div>
  );
};

export default CoinFlip;