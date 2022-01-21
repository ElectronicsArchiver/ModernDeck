/*
 * Advanced Mute Engine for TweetDeck
 * Copyright (c) 2017 pixeldesu
 * 
 * Based off of the modifications made by Damien Erambert for Better TweetDeck
 *
 * This version of the AME is modified for usage in ModernDeck
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

import { getPref, setPref } from "./StoragePreferences";

/*
  ModernDeck uses the BTD namespace for AME to enable interoperability between them,
  and so mutes will work across them whenever ModernDeck fully supports AME in the future.
*/

const AMEFilters = {
  NFT_AVATAR: 'BTD_nft_avatar',
  IS_RETWEET_FROM: 'BTD_is_retweet_from',
  MUTE_USER_KEYWORD: 'BTD_mute_user_keyword',
  REGEX_DISPLAYNAME: 'BTD_mute_displayname',
  REGEX: 'BTD_regex',
  USER_REGEX: 'BTD_user_regex',
  MUTE_QUOTES: 'BTD_mute_quotes',
  USER_BIOGRAPHIES: 'BTD_user_biographies',
  DEFAULT_AVATARS: 'BTD_default_avatars',
  FOLLOWER_COUNT_LESS_THAN: 'BTD_follower_count_less_than',
  FOLLOWER_COUNT_GREATER_THAN: 'BTD_follower_count_greater_than',
  SPECIFIC_TWEET: 'BTD_specific_tweet',
}

const nonUserSpecificsTypes = [
  "source", // TD.vo.Filter.SOURCE
  "phrase", // TD.vo.Filter.SOURCE
  AMEFilters.REGEX,
];

const userSpecificTypes = [
  AMEFilters.DEFAULT_AVATARS,
  AMEFilters.FOLLOWER_COUNT_GREATER_THAN,
  AMEFilters.FOLLOWER_COUNT_LESS_THAN,
  AMEFilters.MUTE_USER_KEYWORD,
  AMEFilters.NFT_AVATAR,
  AMEFilters.REGEX_DISPLAYNAME,
  AMEFilters.USER_BIOGRAPHIES,
  AMEFilters.USER_REGEX,
];

const muteTypeAllowlist = [...nonUserSpecificsTypes, ...userSpecificTypes];

function getInitialMuteCatches() {
  const fromLocalStorage = getPref("mtd_ame_mute_catches", []).filter((c) => RMuteCatch.is(c));
  return new Map(fromLocalStorage);
}

const muteCatches = getInitialMuteCatches();

const clearMuteCatches = () => {
  muteCatches.clear();
};

export function encodeCatchKey(muteCatch) {
  return [muteCatch.filterType, muteCatch.user.id, encodeURIComponent(muteCatch.value)].join('$_$');
}

export function encodeMuteReasonKey(muteReason) {
  return [muteReason.filterType, encodeURIComponent(muteReason.value)].join('$_$');
}
export function decodeMuteReasonKey(muteReasonKey) {
  const [filterType, rawValue] = muteReasonKey.split('$_$');

  return {
    filterType: filterType,
    value: decodeURIComponent(rawValue),
  };
}

function getMeaningfulUser(target) {
  return (
    target.retweetedStatus?.user ||
    target.sourceUser ||
    target.user ||
    target.following ||
    target.owner || []
  );
}

function serializeMuteCatch(target, filter)  {
  const meaningfulUser = getMeaningfulUser(target);
  // console.log(meaningfulUser);
  if (!meaningfulUser) {
    console.debug(filter, target);
  }

  const simplifiedUser = {
    avatar: meaningfulUser.profileImageURL,
    id: meaningfulUser.id,
    screenName: meaningfulUser.screenName,
    name: meaningfulUser.name,
  };

  return {
    filterType: filter.type,
    value: filter.value,
    user: simplifiedUser,
  };
}

function maybeLogMuteCatch(
  target,
  filter,
  shouldDisplay
) {
  return new Promise((resolve) => {
    // If the filter isn't part of our allowlist, nothing to do.
    if (!muteTypeAllowlist.includes(filter.type)) {
      return resolve();
    }
    // Serialize our catch for easy storage
    const serialized = serializeMuteCatch(target, filter);

    // Make a unique key based on target+filter+value
    const catchKey = encodeCatchKey(serialized);

    if (muteCatches.has(catchKey)) {
      // If the target was previously matched and isn't anymore, then we can remove them.
      if (shouldDisplay && !nonUserSpecificsTypes.includes(filter.type)) {
        muteCatches.delete(catchKey);
      }
      // Otherwise, we can stop here
      return resolve();
    }

    if (shouldDisplay) {
      return resolve();
    }

    // If we have a user-specific filter type, make sure we're logging the right user.
    if (
      userSpecificTypes.includes(filter.type) &&
      getMeaningfulUser(target).screenName !== target.user.screenName
    ) {
      return resolve();
    }

    muteCatches.set(catchKey, serialized);
    return resolve();
  });
}



export function removeCatchesByFilter(filter) {
  Array.from(muteCatches.entries()).forEach(([key, value]) => {
    if (value.filterType === filter.type && value.value === filter.value) {
      muteCatches.delete(key);
    }
  });
}

export const setupAME = () => {
  // Save references of original functions
  TD.vo.Filter.prototype._getDisplayType = TD.vo.Filter.prototype.getDisplayType;
  TD.vo.Filter.prototype._pass = TD.vo.Filter.prototype.pass;

  TD.controller.filterManager._addFilter = TD.controller.filterManager.addFilter;
  TD.controller.filterManager._removeFilter = TD.controller.filterManager.removeFilter;

  // Custom filters
  const AmeFilters = {
    NFT_AVATAR: {
      display: {
        global: false,
        options: false,
        actions: false,
      },
      name: 'Mute accounts with an NFT avatar',
      descriptor: 'accounts with an NFT avatar',
      placeholder: 'nothing!',
      function(t, e) {
        if (typeof e.user?.hasNftAvatar === 'undefined') {
          return true;
        }

        return e.user.hasNftAvatar === false;
      },
    },
    SPECIFIC_TWEET: {
      name: 'Specific tweet',
      descriptor: 'specific tweet',
      placeholder: 'ID of tweet',
      options: {
        templateString: '{{chirp.id}}',
        nameInDropdown: 'Hide this tweet',
      },
      function(t, e) {
        if (e.id === t.value) {
          return false;
        }

        return true;
      },
    },
    IS_RETWEET_FROM: {
      display: {
        actions: true,
      },
      name: 'Retweets from User',
      descriptor: 'retweets from',
      placeholder: 'e.g. tweetdeck',
      function(t, e) {
        return !(e.isRetweetedStatus() && t.value === e.user.screenName.toLowerCase());
      },
    },
    MUTE_USER_KEYWORD: {
      display: {
        global: true,
      },
      name: 'Keyword from User',
      descriptor: 'user|keyword: ',
      placeholder: 'e.g. tweetdeck|feature',
      function(t, e) {
        if (!e.user) return true;
        const filter = t.value.split('|');
        const user = filter[0];
        const keyword = filter[1];

        return !(
          e.text.toLowerCase().includes(keyword) && user === e.user.screenName.toLowerCase()
        );
      },
    },
    REGEX_DISPLAYNAME: {
      display: {
        global: true,
      },
      name: 'Display name (Regular Expression)',
      descriptor: 'display names matching',
      placeholder: 'Enter a keyword or phrase',
      function(t, e) {
        if (!e.user) return true;
        const regex = new RegExp(t.value, 'gi');

        return !e.user.name.match(regex);
      },
    },
    REGEX: {
      display: {
        global: true,
      },
      name: 'Tweet Text (Regular Expression)',
      descriptor: 'tweets matching',
      placeholder: 'Enter a regular expression',
      function(t, e) {
        const regex = new RegExp(t.value, 'gi');

        return !e.getFilterableText().match(regex);
      },
    },
    USER_REGEX: {
      display: {
        global: true,
      },
      name: 'Username (Regular Expression)',
      descriptor: 'usernames matching',
      placeholder: 'Enter a regular expression',
      function(t, e) {
        if (!e.user) return true;
        const regex = new RegExp(t.value, 'gi');

        return !e.user.screenName.match(regex);
      },
    },
    MUTE_QUOTES: {
      display: {
        actions: true,
      },
      name: 'Quotes from User',
      descriptor: 'quotes from',
      placeholder: 'e.g. tweetdeck',
      function(t, e) {
        if (!e.user) return true;

        return !(e.isQuoteStatus && t.value === e.user.screenName.toLowerCase());
      },
    },
    USER_BIOGRAPHIES: {
      display: {
        global: true,
      },
      name: 'Biography',
      descriptor: 'users whose bio contains',
      placeholder: 'Enter a keyword or phrase',
      function(t, e) {
        if (!e.user) return true;

        return !e.user.description.toLowerCase().includes(t.value);
      },
    },
    DEFAULT_AVATARS: {
      display: {
        global: true,
      },
      name: 'Default Profile Pictures',
      descriptor: 'users having a default profile picture',
      placeholder: 'Write something random here',
      function(t, e) {
        if (!e.user) return true;

        return !e.user.profileImageURL.includes('default');
      },
    },
    FOLLOWER_COUNT_LESS_THAN: {
      display: {
        global: true,
      },
      name: 'Follower count less than',
      descriptor: 'users with less followers than',
      placeholder: 'Enter a number',
      function(t, e) {
        if (!e.user) return true;

        return !(e.user.followersCount < parseInt(t.value, 10));
      },
    },
    FOLLOWER_COUNT_GREATER_THAN: {
      display: {
        global: true,
      },
      name: 'Follower count more than',
      descriptor: 'users with more followers than',
      placeholder: 'Enter a number',
      function(t, e) {
        if (!e.user) return true;

        return !(e.user.followersCount > parseInt(t.value, 10));
      },
    },
  };

  // Custom pass function to apply our filters
  TD.vo.Filter.prototype.pass = function pass(e) {
    // console.log(this.type);
    if (AMEFilters[this.type]) {
      const t = this;
      e = this._getFilterTarget(e);

      const shouldDisplay = AmeFilters[this.type].function(t, e);
      maybeLogMuteCatch(e, this, shouldDisplay);

      return shouldDisplay;
    }

    const shouldDisplay = this._pass(e);

    maybeLogMuteCatch(e, this, shouldDisplay);

    return shouldDisplay;
  };

  TD.controller.filterManager.removeFilter = function removeFilter(filter) {
    const foundFilter = TD.controller.filterManager.getAll().find((f) => f.id === filter.id);
    if (foundFilter) {
      removeCatchesByFilter(foundFilter);
    }
    return this._removeFilter(filter);
  };

  // Custom display type function to show proper description in filter list
  TD.vo.Filter.prototype.getDisplayType = function getDisplayType() {
    if (AMEFilters[this.type]) {
      return AmeFilters[this.type].descriptor;
    }
    return this._getDisplayType();
  };

  // Helper function to build <option>s for the custom filters
  const filterDropdown = function filterDropdown() {
    const filters = Object.keys(AmeFilters);
    let filterString = '';

    filters.forEach((filter) => {
      if (!AMEFilters[filter]) {
        return;
      }
      const fil = AmeFilters[filter];
      if (fil.display && fil.display.global) {
        filterString += `<option value="${filter}">{{_i}}${fil.name}{{/i}}</option>`;
      }
    });

    return filterString;
  };

  // Helper function to build <li>s for the actions dropdown
  // const userDropdown = function userDropdown() {
  //   const filters = Object.keys(AmeFilters);
  //   let filterString = '';

  //   filters.forEach((filter) => {
  //     if (!AMEFilters[filter]) {
  //       return;
  //     }
  //     const fil = AmeFilters[filter];
  //     if (fil.display && fil.display.actions) {
  //       const templateString =
  //         fil.options && fil.options.templateString ? fil.options.templateString : '{{screenName}}';
  //       const name =
  //         fil.options && fil.options.nameInDropdown
  //           ? fil.options.nameInDropdown
  //           : `Mute ${fil.name}`;

  //       filterString += `<li class="is-selectable">
  //           <a href="#" data-mtd-filter="${filter}" data-mtd-value="${templateString}">{{_i}}${name}{{/i}}</a>
  //         </li>`;
  //     }
  //   });

  //   return filterString;
  // };

  $(document).on('change', '.js-filter-types', (e) => {
    e.preventDefault();

    const options = e.target.options;
    const filter = e.target.options[options.selectedIndex].value;

    if (AMEFilters[filter]) {
      $('.js-filter-input').attr('placeholder', AmeFilters[filter].placeholder);
    }
  });

  $('body').on('click', '[data-mtd-filter]', (ev) => {
    ev.preventDefault();
    const filter = $(ev.target).data('mtd-filter');
    const value = $(ev.target).data('mtd-value');

    TD.controller.filterManager.addFilter(filter, value);
  });

  // Add our custom filters to the filter dropdown
  // TD.mustaches['settings/global_setting_filter.mustache'] = TD.mustaches[
  //   'settings/global_setting_filter.mustache'
  // ].replace('</select>', `${filterDropdown()}</select>`);

  // Add our custom filters to the actions dropdown
  // TD.mustaches['menus/actions.mustache'] = TD.mustaches['menus/actions.mustache'].replace(
  //   '{{/isMuted}} ',
  //   `{{/isMuted}} {{#user}} {{^isMe}} ${userDropdown()} {{/isMe}} {{/user}}`
  //);

  const filterKey = 'moderndeck_specific_tweet';
  const filter = AmeFilters[filterKey];

  if (filter.options) {
    // TD.mustaches['menus/actions.mustache'] = TD.mustaches['menus/actions.mustache'].replace(
    //   '{{/isOwnChirp}}',
    //   `{{/isOwnChirp}}
    //         <li class="is-selectable">
    //           <a href="#" action="_" data-mtd-filter="${filterKey}" data-mtd-value="${filter.options.templateString}">${filter.options.nameInDropdown}</a>
    //         </li>
    //       `
    // );
  }
};