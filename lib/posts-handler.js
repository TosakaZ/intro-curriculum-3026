'use strict';
const jade = require('jade');
const Cookies = require('cookies');
const moment = require('moment-timezone');
const util = require('./handler-util');
const Post = require('./post');

const trackingIdKey = 'tracking_id';
const weeks = ['日', '月', '火', '水', '木', '金', '土'];

function handle(req, res) {
  const cookies = new Cookies(req, res);
  addTrackingCookie(cookies);

  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'charset': 'utf-8'
      });
      Post.findAll({ order: 'id DESC' }).then((posts) => {
        posts.forEach((post) => {
          post.content = post.content.replace(/\n/g, '<br>');
          // 出来るだけ自力で、投稿日時に(曜日)を表示させてみたい
          post.formattedCreatedAt = moment(post.createdAt).tz('Asia/Tokyo').format('YYYY年MM月DD日(d) HH時mm分ss秒');
          // dddd => monday / ddd => mon / dd => mo / d => 1 ※0~6 => Sunday~Saturday
          /* 
           * // パターン1：マッチキャプチャした文字列に、RegExp.$1 を使う方法
           * if ( post.formattedCreatedAt.match(/\((\d)\)/) )    // RegExp.$1 に曜日の番号を入れる作業
           * post.formattedCreatedAt = post.formattedCreatedAt.replace(/\((\d)\)/g, '(' + weeks[RegExp.$1 * 1] + ')');
           * // これは、最初にマッチした際の文字列が空の RegExp.$1 に代入され、次の置換の際に RegExp.$1 の値が利用できるので、置換の前に一度だけ無駄にマッチ作業をやらないといけないのでイマイチ。
            */
          // パターン2：マッチキャプチャした文字列に、アロー関数を使う方法
          post.formattedCreatedAt = post.formattedCreatedAt.replace(/\((\d)\)/, 
            ($0, $1) => '(' + weeks[$1*1] + ')'
          );
          // これだと割とシンプルに実装
        });
        res.end(jade.renderFile('./views/posts.jade', {
          posts: posts,
          user: req.user
        }));
        console.info(
          `閲覧されました: user: ${req.user}, ` +
          `trackinId: ${cookies.get(trackingIdKey) },` +
          `remoteAddress: ${req.connection.remoteAddress}, ` +
          `userAgent: ${req.headers['user-agent']} `
          );
      });
      break;
    case 'POST':
      req.on('data', (data) => {
        data = data.toString().replace(/\+/g, ' ');		// 半角スペースが + になるのを防ぐ
        const decoded = decodeURIComponent(data);
        const content = decoded.split('content=')[1];
        console.info('投稿されました: ' + content);
        Post.create({
          content: content,
          trackingCookie: cookies.get(trackingIdKey),
          postedBy: req.user
        }).then(() => {
          handleRedirectPosts(req, res);
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      req.on('data', (data) => {
        const decoded = decodeURIComponent(data);
        const id = decoded.split('id=')[1];
        Post.findById(id).then((post) => {
          if (req.user === post.postedBy || req.user === 'admin') {
            post.destroy();
            console.info(
              `削除されました: user: ${req.user}, ` +
              `remoteAddress: ${req.connection.remoteAddress}, ` +
              `userAgent: ${req.headers['user-agent']} `
              );
          }
          handleRedirectPosts(req, res);
        });
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

function addTrackingCookie(cookies) {
  if (!cookies.get(trackingIdKey)) {
    const trackingId = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const tomorrow = new Date(new Date().getTime() + (1000 * 60 * 60 * 24));
    cookies.set(trackingIdKey, trackingId, { expires: tomorrow });
  }
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

module.exports = {
  handle: handle,
  handleDelete: handleDelete
};
